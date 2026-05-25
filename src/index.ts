#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { selfTest } from "./self-test.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();

  if (process.argv.includes("--self-test")) {
    const passed = await selfTest(config);
    process.exit(passed ? 0 : 1);
  }

  const { server, deps } = createServer(config);
  const availability = await deps.backend.isAvailable();
  logger.info("starting computer-use-agent-harness", {
    version: config.serverVersion,
    transport: config.transport,
    backend: deps.backend.name,
    backendOk: availability.ok,
    dryRun: config.dryRun,
    maxRiskTier: config.maxRiskTier,
    policyMode: config.policyMode,
  });
  if (!availability.ok && !config.dryRun) {
    logger.warn("active backend reports unavailable; OS actions will fail", {
      detail: availability.detail,
    });
  }

  if (config.transport === "http") {
    const app = express();
    app.use(express.json({ limit: "25mb" }));

    app.post("/mcp", async (req, res) => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => void transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.get("/health", (_req, res) => {
      res.json({ ok: true, name: config.serverName, backend: deps.backend.name });
    });

    app.listen(config.httpPort, () => {
      logger.info("HTTP transport listening", { port: config.httpPort });
      logger.warn(
        "HTTP transport has no built-in auth in this scaffold; put it behind a secure proxy.",
      );
    });
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected over stdio");
}

main().catch((err) => {
  logger.error("fatal error during startup", {
    error: err instanceof Error ? err.stack ?? err.message : String(err),
  });
  process.exit(1);
});
