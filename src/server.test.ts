// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

type Block = { type: string; text?: string; data?: string };

function jsonOf(res: CallToolResult): Record<string, unknown> | undefined {
  const text = (res.content as Block[]).find((b) => b.type === "text")?.text;
  return text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
}
function hasImage(res: CallToolResult): boolean {
  return (res.content as Block[]).some((b) => b.type === "image");
}

/** Connect an in-memory MCP client to a dry-run server built from env overrides. */
async function withClient(
  overrides: Record<string, string>,
  run: (client: Client) => Promise<void>,
): Promise<void> {
  const config = loadConfig({
    CUA_DRY_RUN: "true",
    CUA_TELEMETRY_ENABLED: "false",
    ...overrides,
  } as NodeJS.ProcessEnv);
  const { server } = createServer(config);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    await run(client);
  } finally {
    await client.close();
  }
}

/** True if a call was rejected either by throwing or by an isError result. */
async function isRejected(p: Promise<CallToolResult>): Promise<boolean> {
  try {
    return (await p).isError === true;
  } catch {
    return true;
  }
}

const EXPECTED_TOOLS = [
  "harness_status",
  "policy_describe",
  "computer_policy_status",
  "computer_trace_status",
  "computer_screen_info",
  "computer_cursor_position",
  "computer_screenshot",
  "computer_screenshot_region",
  "computer_zoom_region",
  "computer_move_mouse",
  "computer_click",
  "computer_drag",
  "computer_scroll",
  "computer_type",
  "computer_key",
  "computer_window_list",
  "computer_active_window",
  "computer",
];

describe("MCP server (in-memory, dry-run)", () => {
  it("registers the full tool surface", async () => {
    await withClient({}, async (client) => {
      const names = (await client.listTools()).tools.map((t) => t.name);
      for (const name of EXPECTED_TOOLS) expect(names).toContain(name);
      expect(names).toHaveLength(EXPECTED_TOOLS.length);
    });
  });

  it("returns an image plus enriched metadata for screenshots", async () => {
    await withClient({}, async (client) => {
      const res = await client.callTool({ name: "computer_screenshot", arguments: { zoom: 2 } });
      expect(hasImage(res)).toBe(true);
      const meta = jsonOf(res)!;
      for (const k of ["captureMs", "encodeMs", "byteSize", "imageHash", "scaleX", "scaleY", "monitorId", "cropOrigin"]) {
        expect(meta).toHaveProperty(k);
      }
    });
  });

  it("dispatches the legacy `computer` tool", async () => {
    await withClient({}, async (client) => {
      const move = await client.callTool({ name: "computer", arguments: { action: "mouse_move", coordinate: [5, 6] } });
      expect(move.isError).not.toBe(true);
      const shot = await client.callTool({ name: "computer", arguments: { action: "screenshot" } });
      expect(hasImage(shot)).toBe(true);
    });
  });

  it("hard-blocks destructive payloads but allows benign typing (enforce)", async () => {
    await withClient({}, async (client) => {
      const bad = await client.callTool({ name: "computer_type", arguments: { text: "rm -rf / --no-preserve-root" } });
      expect(bad.isError).toBe(true);
      expect(jsonOf(bad)).toMatchObject({ blocked: true });
      const ok = await client.callTool({ name: "computer_type", arguments: { text: "hello world" } });
      expect(ok.isError).not.toBe(true);
    });
  });

  it("rejects schema-invalid input", async () => {
    await withClient({}, async (client) => {
      expect(await isRejected(client.callTool({ name: "computer", arguments: { action: "bogus_action" } }))).toBe(true);
      expect(await isRejected(client.callTool({ name: "computer_screenshot", arguments: { zoom: 99 } }))).toBe(true);
    });
  });

  it("warn mode allows a tier-exceeding action with a warning", async () => {
    await withClient({ CUA_MAX_RISK_TIER: "low", CUA_POLICY_MODE: "warn" }, async (client) => {
      const res = await client.callTool({ name: "computer_type", arguments: { text: "hello" } });
      expect(res.isError).not.toBe(true);
      expect(JSON.stringify(res)).toContain("warn");
    });
  });

  it("confirm mode gates a tier-exceeding action", async () => {
    await withClient({ CUA_MAX_RISK_TIER: "low", CUA_POLICY_MODE: "confirm" }, async (client) => {
      const res = await client.callTool({ name: "computer_type", arguments: { text: "hello" } });
      expect(res.isError).not.toBe(true);
      expect(jsonOf(res)).toMatchObject({ confirmation_required: true });
    });
  });

  it("destructive payloads stay blocked even in warn mode", async () => {
    await withClient({ CUA_MAX_RISK_TIER: "critical", CUA_POLICY_MODE: "warn" }, async (client) => {
      const res = await client.callTool({ name: "computer_type", arguments: { text: "mkfs.ext4 /dev/sda" } });
      expect(res.isError).toBe(true);
      expect(jsonOf(res)).toMatchObject({ blocked: true });
    });
  });
});
