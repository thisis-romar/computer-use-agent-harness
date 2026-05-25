// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { performance } from "node:perf_hooks";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { HarnessConfig } from "./config.js";
import type { ComputerBackend } from "./backends/index.js";
import type { PolicyEngine } from "./policy/policy.js";
import type { Tracer } from "./telemetry/tracer.js";
import type { ActionDescriptor, MouseButton, Region, RiskTier } from "./types.js";

type ToolResult = CallToolResult;
type TextBlock = { type: "text"; text: string };

export interface ToolDeps {
  backend: ComputerBackend;
  policy: PolicyEngine;
  tracer: Tracer;
  config: HarnessConfig;
}

function jsonText(value: unknown): TextBlock {
  return { type: "text", text: JSON.stringify(value, null, 2) };
}

function ok(value: Record<string, unknown>): ToolResult {
  return { content: [jsonText(value)], structuredContent: value };
}

function fail(message: string, extra?: Record<string, unknown>): ToolResult {
  const payload = { error: message, ...(extra ?? {}) };
  return { content: [jsonText(payload)], structuredContent: payload, isError: true };
}

const pointShape = { x: z.number().int(), y: z.number().int() };
const regionShape = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export function registerTools(server: McpServer, deps: ToolDeps): void {
  const { backend, policy, tracer, config } = deps;

  /** Evaluate policy, run the action, and emit exactly one trace record. */
  async function guarded(
    action: ActionDescriptor,
    traceArgs: Record<string, unknown>,
    exec: () => Promise<ToolResult>,
  ): Promise<ToolResult> {
    const decision = policy.evaluate(action);
    const policySummary = {
      effectiveTier: decision.effectiveTier,
      maxTier: decision.maxTier,
      mode: decision.mode,
      firedRules: decision.firedRules,
      confirmationRequired: decision.confirmationRequired,
      ...(decision.warning ? { warning: decision.warning } : {}),
    };

    if (!decision.allowed) {
      await tracer.record({
        tool: action.tool,
        status: decision.confirmationRequired ? "confirm" : "blocked",
        durationMs: 0,
        policy: decision,
        args: traceArgs,
      });
      const payload: Record<string, unknown> = decision.confirmationRequired
        ? { confirmation_required: true, reason: decision.reason, policy: policySummary }
        : { blocked: true, reason: decision.reason, policy: policySummary };
      return {
        content: [jsonText(payload)],
        structuredContent: payload,
        // A confirmation gate is a soft stop, not a tool error.
        isError: !decision.confirmationRequired,
      };
    }

    const start = performance.now();
    try {
      const result = await exec();
      await tracer.record({
        tool: action.tool,
        status: config.dryRun ? "dry-run" : "executed",
        durationMs: Math.round(performance.now() - start),
        policy: decision,
        args: traceArgs,
      });
      if (decision.warning) {
        result.content = [...result.content, jsonText({ warning: decision.warning })];
        if (result.structuredContent) {
          result.structuredContent = { ...result.structuredContent, warning: decision.warning };
        }
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await tracer.record({
        tool: action.tool,
        status: "error",
        durationMs: Math.round(performance.now() - start),
        policy: decision,
        args: traceArgs,
        error: message,
      });
      return fail(`${action.tool} failed: ${message}`);
    }
  }

  /** Shared screenshot path used by the discrete, region, zoom, and legacy tools. */
  async function captureScreenshot(region: Region | undefined, zoom: number | undefined): Promise<ToolResult> {
    const shot = await backend.screenshot({
      region,
      zoom,
      delayMs: config.screenshotDelayMs,
      maxLongEdge: config.maxImageLongEdge,
      maxPixels: config.maxImagePixels,
    });
    const metadata = {
      region: shot.region,
      screenSize: shot.screenSize,
      pixelSize: shot.pixelSize,
      scale: shot.scale,
      scaleX: shot.scaleX,
      scaleY: shot.scaleY,
      zoom: shot.zoom,
      cropOrigin: shot.cropOrigin,
      monitorId: shot.monitorId,
      captureMs: shot.captureMs,
      encodeMs: shot.encodeMs,
      byteSize: shot.byteSize,
      imageHash: shot.imageHash,
      withinBudget: shot.withinBudget,
      downscaled: shot.downscaled,
      capturedAt: shot.capturedAt,
    };
    return {
      content: [{ type: "image", data: shot.base64, mimeType: shot.mimeType }, jsonText(metadata)],
      structuredContent: metadata,
    };
  }

  server.registerTool(
    "harness_status",
    {
      title: "Harness status",
      description: "Report harness configuration, active backend, and telemetry destination.",
      inputSchema: {},
    },
    async () => {
      const availability = await backend.isAvailable();
      return ok({
        server: { name: config.serverName, version: config.serverVersion },
        transport: { kind: config.transport, httpPort: config.httpPort },
        backend: { name: backend.name, platform: backend.platform, availability },
        dryRun: config.dryRun,
        policy: policy.describe(),
        capture: {
          screenshotDelayMs: config.screenshotDelayMs,
          maxImageLongEdge: config.maxImageLongEdge,
          maxImagePixels: config.maxImagePixels,
        },
        telemetry: {
          enabled: config.telemetry.enabled,
          path: config.telemetry.path,
          redactPayloads: config.telemetry.redactPayloads,
          sessionId: tracer.sessionId,
        },
      });
    },
  );

  server.registerTool(
    "policy_describe",
    {
      title: "Describe policy",
      description: "Return the configured maximum risk tier and the active policy rules.",
      inputSchema: {},
    },
    async () => ok(policy.describe() as unknown as Record<string, unknown>),
  );

  server.registerTool(
    "computer_screen_info",
    {
      title: "Screen info",
      description: "Return the primary screen size and current backend availability.",
      inputSchema: {},
    },
    async () =>
      guarded(
        { tool: "computer_screen_info", baseTier: "safe", summary: "read screen size" },
        {},
        async () => {
          const size = await backend.getScreenSize();
          return ok({ screenSize: size, backend: backend.name });
        },
      ),
  );

  server.registerTool(
    "computer_cursor_position",
    {
      title: "Cursor position",
      description: "Return the current mouse cursor position in logical screen coordinates.",
      inputSchema: {},
    },
    async () =>
      guarded(
        { tool: "computer_cursor_position", baseTier: "safe", summary: "read cursor position" },
        {},
        async () => ok({ position: await backend.cursorPosition() }),
      ),
  );

  server.registerTool(
    "computer_screenshot",
    {
      title: "Screenshot",
      description:
        "Capture the screen (or a logical region) as PNG, with zoom support. Returns the image plus stable metadata (region, screenSize, pixelSize, scaleX/scaleY, zoom, captureMs, encodeMs, byteSize, imageHash, monitorId).",
      inputSchema: {
        region: regionShape.optional().describe("Logical region to capture; defaults to full screen."),
        zoom: z.number().positive().max(8).optional().describe("Magnification factor (1 = native)."),
      },
    },
    async (args) =>
      guarded(
        {
          tool: "computer_screenshot",
          baseTier: "safe",
          summary: `capture ${args.region ? "region" : "full screen"} zoom=${args.zoom ?? 1}`,
        },
        { region: args.region, zoom: args.zoom },
        () => captureScreenshot(args.region, args.zoom),
      ),
  );

  server.registerTool(
    "computer_move_mouse",
    {
      title: "Move mouse",
      description: "Move the mouse cursor to absolute logical coordinates.",
      inputSchema: { ...pointShape },
    },
    async (args) =>
      guarded(
        {
          tool: "computer_move_mouse",
          baseTier: "low",
          summary: `move to ${args.x},${args.y}`,
          target: { x: args.x, y: args.y },
        },
        { x: args.x, y: args.y },
        async () => {
          await backend.moveMouse({ x: args.x, y: args.y });
          return ok({ moved: { x: args.x, y: args.y } });
        },
      ),
  );

  server.registerTool(
    "computer_click",
    {
      title: "Click",
      description: "Click a mouse button, optionally moving to coordinates first.",
      inputSchema: {
        x: z.number().int().optional(),
        y: z.number().int().optional(),
        button: z.enum(["left", "right", "middle"]).default("left"),
        count: z.number().int().min(1).max(3).default(1),
      },
    },
    async (args) => {
      const point = args.x !== undefined && args.y !== undefined ? { x: args.x, y: args.y } : undefined;
      const button = args.button as MouseButton;
      return guarded(
        {
          tool: "computer_click",
          baseTier: "low",
          summary: `${button} click x${args.count} at ${point ? `${point.x},${point.y}` : "current"}`,
          ...(point ? { target: point } : {}),
        },
        { x: args.x, y: args.y, button, count: args.count },
        async () => {
          await backend.click(point, button, args.count);
          return ok({ clicked: { point: point ?? "current", button, count: args.count } });
        },
      );
    },
  );

  server.registerTool(
    "computer_scroll",
    {
      title: "Scroll",
      description: "Scroll the wheel by discrete steps, optionally at given coordinates.",
      inputSchema: {
        x: z.number().int().optional(),
        y: z.number().int().optional(),
        dx: z.number().int().default(0).describe("Horizontal steps (+right / -left)."),
        dy: z.number().int().default(0).describe("Vertical steps (+down / -up)."),
      },
    },
    async (args) => {
      const point = args.x !== undefined && args.y !== undefined ? { x: args.x, y: args.y } : undefined;
      return guarded(
        {
          tool: "computer_scroll",
          baseTier: "low",
          summary: `scroll dx=${args.dx} dy=${args.dy}`,
          ...(point ? { target: point } : {}),
        },
        { x: args.x, y: args.y, dx: args.dx, dy: args.dy },
        async () => {
          await backend.scroll(point, args.dx, args.dy);
          return ok({ scrolled: { dx: args.dx, dy: args.dy } });
        },
      );
    },
  );

  server.registerTool(
    "computer_type",
    {
      title: "Type text",
      description: "Type a string of text into the focused element.",
      inputSchema: { text: z.string().min(1).max(10_000) },
    },
    async (args) =>
      guarded(
        {
          tool: "computer_type",
          baseTier: "medium",
          summary: `type ${args.text.length} chars`,
          payload: args.text,
        },
        { text: tracer.redact(args.text) },
        async () => {
          await backend.typeText(args.text);
          return ok({ typed: { length: args.text.length } });
        },
      ),
  );

  server.registerTool(
    "computer_key",
    {
      title: "Key combo",
      description: 'Press a key combination, e.g. "ctrl+c", "Return", "alt+Tab".',
      inputSchema: { keys: z.string().min(1).max(64) },
    },
    async (args) =>
      guarded(
        {
          tool: "computer_key",
          baseTier: "medium",
          summary: `key ${args.keys}`,
          payload: args.keys,
        },
        { keys: args.keys },
        async () => {
          await backend.key(args.keys);
          return ok({ pressed: args.keys });
        },
      ),
  );

  server.registerTool(
    "computer_drag",
    {
      title: "Drag",
      description: "Press the left button and drag from the current cursor position to a point.",
      inputSchema: { ...pointShape },
    },
    async (args) =>
      guarded(
        {
          tool: "computer_drag",
          baseTier: "low",
          summary: `drag to ${args.x},${args.y}`,
          target: { x: args.x, y: args.y },
        },
        { x: args.x, y: args.y },
        async () => {
          await backend.drag({ x: args.x, y: args.y });
          return ok({ dragged: { x: args.x, y: args.y } });
        },
      ),
  );

  server.registerTool(
    "computer_screenshot_region",
    {
      title: "Screenshot region",
      description: "Capture a bounded region screenshot with coordinate metadata.",
      inputSchema: { region: regionShape },
    },
    async (args) =>
      guarded(
        { tool: "computer_screenshot_region", baseTier: "safe", summary: "capture region" },
        { region: args.region },
        () => captureScreenshot(args.region, undefined),
      ),
  );

  server.registerTool(
    "computer_zoom_region",
    {
      title: "Zoom region",
      description: "Capture and magnify a bounded region for dense UI inspection.",
      inputSchema: {
        region: regionShape,
        zoom: z.number().positive().max(8).default(2).describe("Magnification factor."),
      },
    },
    async (args) =>
      guarded(
        { tool: "computer_zoom_region", baseTier: "safe", summary: `zoom region x${args.zoom}` },
        { region: args.region, zoom: args.zoom },
        () => captureScreenshot(args.region, args.zoom),
      ),
  );

  server.registerTool(
    "computer_window_list",
    {
      title: "Window list",
      description: "List visible windows when supported by the active backend.",
      inputSchema: {},
    },
    async () =>
      guarded(
        { tool: "computer_window_list", baseTier: "safe", summary: "list windows" },
        {},
        async () => ok({ windows: await backend.windows() }),
      ),
  );

  server.registerTool(
    "computer_active_window",
    {
      title: "Active window",
      description: "Return the currently focused window when supported by the active backend.",
      inputSchema: {},
    },
    async () =>
      guarded(
        { tool: "computer_active_window", baseTier: "safe", summary: "active window" },
        {},
        async () => ok({ activeWindow: await backend.activeWindow() }),
      ),
  );

  server.registerTool(
    "computer_policy_status",
    {
      title: "Policy status",
      description: "Return the current policy mode, maximum risk tier, and active rules.",
      inputSchema: {},
    },
    async () => ok(policy.describe() as unknown as Record<string, unknown>),
  );

  server.registerTool(
    "computer_trace_status",
    {
      title: "Trace status",
      description: "Return telemetry recorder status (enabled, path, session, count).",
      inputSchema: {},
    },
    async () => ok(tracer.status()),
  );

  registerLegacyComputerTool(server, deps, guarded, captureScreenshot);
}

const LEGACY_ACTIONS = [
  "key",
  "type",
  "mouse_move",
  "left_click",
  "left_click_drag",
  "right_click",
  "middle_click",
  "double_click",
  "scroll",
  "screenshot",
  "get_screenshot",
  "screenshot_region",
  "zoom_region",
  "cursor",
  "get_cursor_position",
  "window_list",
  "active_window",
] as const;

function legacyBaseTier(action: string): RiskTier {
  switch (action) {
    case "key":
    case "type":
      return "medium";
    case "mouse_move":
    case "scroll":
    case "left_click":
    case "left_click_drag":
    case "right_click":
    case "middle_click":
    case "double_click":
      return "low";
    default:
      return "safe";
  }
}

type GuardedFn = (
  action: ActionDescriptor,
  traceArgs: Record<string, unknown>,
  exec: () => Promise<ToolResult>,
) => Promise<ToolResult>;

/**
 * Anthropic-compatible single `computer` tool. Maps the legacy action set onto
 * the structured backend so existing computer-use clients work unchanged, while
 * still flowing through policy + telemetry.
 */
function registerLegacyComputerTool(
  server: McpServer,
  deps: ToolDeps,
  guarded: GuardedFn,
  captureScreenshot: (region: Region | undefined, zoom: number | undefined) => Promise<ToolResult>,
): void {
  const { backend } = deps;
  server.registerTool(
    "computer",
    {
      title: "Computer (compatibility)",
      description:
        "Compatibility computer-use tool. Prefer the structured computer_* tools. Actions: key, type, mouse_move, left_click, left_click_drag, right_click, middle_click, double_click, scroll, screenshot, screenshot_region, zoom_region, cursor, window_list, active_window.",
      inputSchema: {
        action: z.enum(LEGACY_ACTIONS),
        text: z.string().optional(),
        coordinate: z.tuple([z.number().int(), z.number().int()]).optional(),
        region: regionShape.optional(),
        scroll_x: z.number().int().optional(),
        scroll_y: z.number().int().optional(),
      },
    },
    async (input) => {
      const action = input.action;
      const point = input.coordinate ? { x: input.coordinate[0], y: input.coordinate[1] } : undefined;
      return guarded(
        {
          tool: "computer",
          baseTier: legacyBaseTier(action),
          summary: `legacy ${action}`,
          ...(action === "type" || action === "key" ? { payload: input.text } : {}),
          ...(point ? { target: point } : {}),
        },
        {
          action,
          ...(input.text !== undefined
            ? { text: action === "type" ? deps.tracer.redact(input.text) : input.text }
            : {}),
          ...(point ? { coordinate: [point.x, point.y] } : {}),
          ...(input.region ? { region: input.region } : {}),
        },
        async (): Promise<ToolResult> => {
          switch (action) {
            case "screenshot":
            case "get_screenshot":
              return captureScreenshot(undefined, undefined);
            case "screenshot_region":
              if (!input.region) throw new Error("region is required for screenshot_region");
              return captureScreenshot(input.region, undefined);
            case "zoom_region":
              if (!input.region) throw new Error("region is required for zoom_region");
              return captureScreenshot(input.region, 2);
            case "cursor":
            case "get_cursor_position":
              return ok({ position: await backend.cursorPosition() });
            case "window_list":
              return ok({ windows: await backend.windows() });
            case "active_window":
              return ok({ activeWindow: await backend.activeWindow() });
            case "mouse_move":
              if (!point) throw new Error("coordinate is required for mouse_move");
              await backend.moveMouse(point);
              return ok({ ok: true });
            case "left_click_drag":
              if (!point) throw new Error("coordinate is required for left_click_drag");
              await backend.drag(point);
              return ok({ ok: true });
            case "left_click":
              await backend.click(point, "left", 1);
              return ok({ ok: true });
            case "right_click":
              await backend.click(point, "right", 1);
              return ok({ ok: true });
            case "middle_click":
              await backend.click(point, "middle", 1);
              return ok({ ok: true });
            case "double_click":
              await backend.click(point, "left", 2);
              return ok({ ok: true });
            case "key":
              if (!input.text) throw new Error("text is required for key");
              await backend.key(input.text);
              return ok({ ok: true });
            case "type":
              if (input.text === undefined) throw new Error("text is required for type");
              await backend.typeText(input.text);
              return ok({ ok: true });
            case "scroll":
              await backend.scroll(point, input.scroll_x ?? 0, input.scroll_y ?? 0);
              return ok({ ok: true });
            default:
              throw new Error(`Unsupported action: ${action satisfies never}`);
          }
        },
      );
    },
  );
}
