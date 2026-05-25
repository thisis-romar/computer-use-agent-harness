import { performance } from "node:perf_hooks";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { HarnessConfig } from "./config.js";
import type { ComputerBackend } from "./backends/index.js";
import type { PolicyEngine } from "./policy/policy.js";
import type { Tracer } from "./telemetry/tracer.js";
import type { ActionDescriptor, MouseButton } from "./types.js";

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
    if (!decision.allowed) {
      await tracer.record({
        tool: action.tool,
        status: "blocked",
        durationMs: 0,
        policy: decision,
        args: traceArgs,
      });
      return fail(`Policy blocked ${action.tool}: ${decision.reason}`, {
        policy: {
          effectiveTier: decision.effectiveTier,
          maxTier: decision.maxTier,
          firedRules: decision.firedRules,
        },
      });
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
        backend: { name: backend.name, platform: backend.platform, availability },
        dryRun: config.dryRun,
        policy: policy.describe(),
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
        "Capture the screen (or a logical region) as PNG, with zoom support. Returns the image plus stable metadata (region, screenSize, pixelSize, scale, zoom).",
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
        async () => {
          const shot = await backend.screenshot({ region: args.region, zoom: args.zoom });
          const metadata = {
            region: shot.region,
            screenSize: shot.screenSize,
            pixelSize: shot.pixelSize,
            scale: shot.scale,
            zoom: shot.zoom,
            capturedAt: shot.capturedAt,
          };
          return {
            content: [
              { type: "image", data: shot.base64, mimeType: shot.mimeType },
              jsonText(metadata),
            ],
            structuredContent: metadata,
          };
        },
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
}
