#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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
    backend: deps.backend.name,
    backendOk: availability.ok,
    dryRun: config.dryRun,
    maxRiskTier: config.maxRiskTier,
  });
  if (!availability.ok && !config.dryRun) {
    logger.warn("active backend reports unavailable; OS actions will fail", {
      detail: availability.detail,
    });
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
