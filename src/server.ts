// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createBackend } from "./backends/index.js";
import type { HarnessConfig } from "./config.js";
import { PolicyEngine } from "./policy/policy.js";
import { Tracer } from "./telemetry/tracer.js";
import { registerTools, type ToolDeps } from "./tools.js";

export interface BuiltServer {
  server: McpServer;
  deps: ToolDeps;
}

/** Assemble the MCP server, policy engine, tracer, and backend from config. */
export function createServer(config: HarnessConfig): BuiltServer {
  const server = new McpServer(
    { name: config.serverName, version: config.serverVersion },
    {
      instructions:
        "Hardened computer-use harness. Tools are policy-gated by risk tier and every " +
        "invocation is traced. Prefer computer_screenshot to observe before acting.",
    },
  );

  const deps: ToolDeps = {
    backend: createBackend(config),
    policy: new PolicyEngine({ maxTier: config.maxRiskTier, mode: config.policyMode }),
    tracer: new Tracer(config.telemetry),
    config,
  };

  registerTools(server, deps);
  return { server, deps };
}
