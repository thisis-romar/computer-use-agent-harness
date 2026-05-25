// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

const env = (o: Record<string, string>) => loadConfig(o as NodeJS.ProcessEnv);

describe("loadConfig", () => {
  it("applies safe defaults with an empty environment", () => {
    const c = env({});
    expect(c.transport).toBe("stdio");
    expect(c.httpPort).toBe(3099);
    expect(c.policyMode).toBe("enforce");
    expect(c.maxRiskTier).toBe("medium");
    expect(c.backend).toBe("auto");
    expect(c.dryRun).toBe(false);
    expect(c.telemetry.enabled).toBe(true);
    expect(c.telemetry.redactPayloads).toBe(true);
    expect(c.screenshotDelayMs).toBe(150);
    expect(c.maxImageLongEdge).toBe(1568);
    expect(c.maxImagePixels).toBe(Math.floor(1.15 * 1024 * 1024));
  });

  it("parses transport and port", () => {
    expect(env({ CUA_TRANSPORT: "http", CUA_HTTP_PORT: "8080" }).httpPort).toBe(8080);
    expect(env({ CUA_TRANSPORT: "http" }).transport).toBe("http");
    expect(env({ CUA_TRANSPORT: "weird" }).transport).toBe("stdio");
    expect(env({ CUA_HTTP_PORT: "not-a-number" }).httpPort).toBe(3099);
  });

  it("maps policy modes, treating the reference 'block' alias as enforce", () => {
    expect(env({ CUA_POLICY_MODE: "warn" }).policyMode).toBe("warn");
    expect(env({ CUA_POLICY_MODE: "confirm" }).policyMode).toBe("confirm");
    expect(env({ CUA_POLICY_MODE: "block" }).policyMode).toBe("enforce");
    expect(env({ CUA_POLICY_MODE: "nonsense" }).policyMode).toBe("enforce");
  });

  it("validates the risk tier, falling back to medium", () => {
    expect(env({ CUA_MAX_RISK_TIER: "high" }).maxRiskTier).toBe("high");
    expect(env({ CUA_MAX_RISK_TIER: "SAFE" }).maxRiskTier).toBe("safe");
    expect(env({ CUA_MAX_RISK_TIER: "bogus" }).maxRiskTier).toBe("medium");
  });

  it("infers dry-run from the dry-run backend but lets an explicit flag override", () => {
    expect(env({ CUA_BACKEND: "dry-run" }).dryRun).toBe(true);
    expect(env({ CUA_BACKEND: "dry-run", CUA_DRY_RUN: "false" }).dryRun).toBe(false);
    expect(env({ CUA_BACKEND: "windows", CUA_DRY_RUN: "true" }).dryRun).toBe(true);
  });

  it("parses booleans for telemetry toggles", () => {
    expect(env({ CUA_TELEMETRY_ENABLED: "0" }).telemetry.enabled).toBe(false);
    expect(env({ CUA_REDACT_PAYLOADS: "no" }).telemetry.redactPayloads).toBe(false);
  });
});
