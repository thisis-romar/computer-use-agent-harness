// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { RISK_TIERS, type RiskTier } from "./types.js";

export type BackendSelector =
  | "auto"
  | "windows"
  | "browser"
  | "accessibility"
  | "dry-run";

export type TransportKind = "stdio" | "http";

/**
 * Policy enforcement posture for tier-ceiling violations:
 *   enforce -> deny, confirm -> deny + confirmationRequired, warn -> allow + warning.
 * Content hard-blocks (e.g. destructive payloads) always deny regardless of mode.
 */
export type PolicyMode = "enforce" | "warn" | "confirm";

export interface HarnessConfig {
  serverName: string;
  serverVersion: string;
  /** Transport to expose the MCP server over. */
  transport: TransportKind;
  /** Port for the HTTP transport when transport === "http". */
  httpPort: number;
  /** Enforcement posture for tier-ceiling violations. */
  policyMode: PolicyMode;
  /** Pre-capture settle delay (ms) before taking a screenshot. */
  screenshotDelayMs: number;
  /** Downscale screenshots whose longest edge exceeds this (px). */
  maxImageLongEdge: number;
  /** Downscale screenshots whose pixel count exceeds this budget. */
  maxImagePixels: number;
  /** Which native backend to load. "auto" picks by platform. */
  backend: BackendSelector;
  /**
   * When true, the active backend is wrapped so that mutating actions are
   * traced and validated but never dispatched to the OS. Screenshots return
   * synthetic metadata. Useful in CI and headless containers.
   */
  dryRun: boolean;
  /** Maximum risk tier permitted by the policy engine. */
  maxRiskTier: RiskTier;
  telemetry: {
    enabled: boolean;
    /** Path to the JSONL trace file. */
    path: string;
    /** Redact typed-text payloads (store length + hash instead of raw text). */
    redactPayloads: boolean;
  };
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseTier(value: string | undefined, fallback: RiskTier): RiskTier {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if ((RISK_TIERS as readonly string[]).includes(normalized)) {
    return normalized as RiskTier;
  }
  return fallback;
}

function parseTransport(value: string | undefined): TransportKind {
  return value?.trim().toLowerCase() === "http" ? "http" : "stdio";
}

function parsePolicyMode(value: string | undefined): PolicyMode {
  const normalized = (value ?? "enforce").trim().toLowerCase();
  if (normalized === "warn" || normalized === "confirm") return normalized;
  // Accept the reference "block" alias for the strict posture.
  return "enforce";
}

function intEnv(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBackend(value: string | undefined): BackendSelector {
  const allowed: BackendSelector[] = ["auto", "windows", "browser", "accessibility", "dry-run"];
  const normalized = (value ?? "auto").trim().toLowerCase();
  return (allowed as string[]).includes(normalized)
    ? (normalized as BackendSelector)
    : "auto";
}

function defaultTracePath(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return process.env.CUA_TELEMETRY_PATH ?? `traces/actions-${stamp}.jsonl`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): HarnessConfig {
  const backend = parseBackend(env.CUA_BACKEND);
  // dry-run is implied when the backend selector is explicitly "dry-run".
  const dryRun = parseBool(env.CUA_DRY_RUN, backend === "dry-run");

  return {
    serverName: env.CUA_SERVER_NAME ?? "computer-use-agent-harness",
    serverVersion: env.CUA_SERVER_VERSION ?? "0.1.0",
    transport: parseTransport(env.CUA_TRANSPORT),
    httpPort: intEnv(env.CUA_HTTP_PORT, 3099),
    policyMode: parsePolicyMode(env.CUA_POLICY_MODE),
    screenshotDelayMs: intEnv(env.CUA_SCREENSHOT_DELAY_MS, 150),
    maxImageLongEdge: intEnv(env.CUA_MAX_IMAGE_LONG_EDGE, 1568),
    maxImagePixels: intEnv(env.CUA_MAX_IMAGE_PIXELS, Math.floor(1.15 * 1024 * 1024)),
    backend,
    dryRun,
    maxRiskTier: parseTier(env.CUA_MAX_RISK_TIER, "medium"),
    telemetry: {
      enabled: parseBool(env.CUA_TELEMETRY_ENABLED, true),
      path: defaultTracePath(),
      redactPayloads: parseBool(env.CUA_REDACT_PAYLOADS, true),
    },
  };
}
