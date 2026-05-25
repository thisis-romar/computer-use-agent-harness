// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { createBackend } from "./backends/index.js";
import type { HarnessConfig } from "./config.js";
import { logger } from "./logger.js";
import { PolicyEngine } from "./policy/policy.js";
import { Tracer } from "./telemetry/tracer.js";

/**
 * In-process smoke test that exercises the full action path without a live MCP
 * client: backend probe, screenshot metadata, a permitted action trace, and a
 * policy block. Returns true when every check passes.
 */
export async function selfTest(config: HarnessConfig): Promise<boolean> {
  const backend = createBackend(config);
  const policy = new PolicyEngine({ maxTier: config.maxRiskTier, mode: config.policyMode });
  const tracer = new Tracer(config.telemetry);
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  const availability = await backend.isAvailable();
  checks.push({
    name: "backend.isAvailable",
    pass: typeof availability.ok === "boolean",
    detail: `${backend.name}: ${availability.detail}`,
  });

  try {
    const shot = await backend.screenshot({ zoom: 2 });
    const valid =
      shot.mimeType === "image/png" &&
      shot.base64.length > 0 &&
      shot.pixelSize.width > 0 &&
      shot.zoom === 2 &&
      shot.byteSize > 0 &&
      shot.imageHash.length > 0 &&
      typeof shot.scaleX === "number" &&
      typeof shot.captureMs === "number";
    checks.push({
      name: "screenshot.metadata",
      pass: valid,
      detail: `pixelSize=${shot.pixelSize.width}x${shot.pixelSize.height} scaleX=${shot.scaleX} zoom=${shot.zoom} bytes=${shot.byteSize} hash=${shot.imageHash}`,
    });
  } catch (err) {
    checks.push({
      name: "screenshot.metadata",
      pass: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const safe = policy.evaluate({ tool: "computer_screenshot", baseTier: "safe", summary: "capture" });
  checks.push({ name: "policy.allow-safe", pass: safe.allowed, detail: safe.reason });

  const destructive = policy.evaluate({
    tool: "computer_type",
    baseTier: "medium",
    summary: "type destructive",
    payload: "rm -rf / --no-preserve-root",
  });
  checks.push({
    name: "policy.block-destructive",
    pass: !destructive.allowed && destructive.effectiveTier === "critical",
    detail: destructive.reason,
  });

  await tracer.record({
    tool: "self_test",
    status: "executed",
    durationMs: 0,
    policy: safe,
    args: { note: "self-test trace record" },
  });
  checks.push({ name: "telemetry.write", pass: true, detail: config.telemetry.path });

  const allPass = checks.every((c) => c.pass);
  for (const c of checks) {
    logger[c.pass ? "info" : "error"](`self-test ${c.pass ? "PASS" : "FAIL"} ${c.name}`, {
      detail: c.detail,
    });
  }
  logger[allPass ? "info" : "error"](`self-test ${allPass ? "PASSED" : "FAILED"}`, {
    passed: checks.filter((c) => c.pass).length,
    total: checks.length,
  });
  return allPass;
}
