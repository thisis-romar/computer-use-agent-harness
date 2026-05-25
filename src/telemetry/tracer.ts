// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { PolicyDecision } from "../policy/policy.js";
import { logger } from "../logger.js";
import { newId } from "../utils/id.js";

export interface TraceRecord {
  id: string;
  ts: string;
  sessionId: string;
  seq: number;
  tool: string;
  status: "executed" | "blocked" | "confirm" | "error" | "dry-run";
  durationMs: number;
  policy: {
    allowed: boolean;
    confirmationRequired: boolean;
    effectiveTier: string;
    maxTier: string;
    mode: string;
    firedRules: string[];
    reason: string;
    warning?: string;
  };
  /** Sanitized argument summary. Sensitive payloads are redacted. */
  args: Record<string, unknown>;
  error?: string;
}

export interface TracerOptions {
  enabled: boolean;
  path: string;
  redactPayloads: boolean;
}

/**
 * Append-only JSONL action tracer.
 *
 * Each completed (or rejected) tool invocation produces exactly one line of
 * valid JSON, making the trace stream cheap to tail, grep, and replay.
 */
export class Tracer {
  readonly sessionId = randomUUID();
  private seq = 0;
  private dirReady = false;
  private readonly opts: TracerOptions;

  constructor(opts: TracerOptions) {
    this.opts = opts;
  }

  status(): { enabled: boolean; path: string; sessionId: string; recorded: number } {
    return {
      enabled: this.opts.enabled,
      path: this.opts.path,
      sessionId: this.sessionId,
      recorded: this.seq,
    };
  }

  /** Redact a free-text payload to a stable, non-reversible descriptor. */
  redact(payload: string | undefined): string | undefined {
    if (payload === undefined) return undefined;
    if (!this.opts.redactPayloads) return payload;
    const hash = createHash("sha256").update(payload).digest("hex").slice(0, 12);
    return `redacted(len=${payload.length},sha256=${hash})`;
  }

  async record(
    entry: Omit<TraceRecord, "id" | "ts" | "sessionId" | "seq"> & {
      policy: PolicyDecision | TraceRecord["policy"];
    },
  ): Promise<void> {
    const policy: TraceRecord["policy"] =
      "baseTier" in entry.policy
        ? {
            allowed: entry.policy.allowed,
            confirmationRequired: entry.policy.confirmationRequired,
            effectiveTier: entry.policy.effectiveTier,
            maxTier: entry.policy.maxTier,
            mode: entry.policy.mode,
            firedRules: entry.policy.firedRules,
            reason: entry.policy.reason,
            ...(entry.policy.warning ? { warning: entry.policy.warning } : {}),
          }
        : entry.policy;

    const record: TraceRecord = {
      id: newId("trace"),
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      seq: this.seq++,
      tool: entry.tool,
      status: entry.status,
      durationMs: entry.durationMs,
      policy,
      args: entry.args,
      ...(entry.error !== undefined ? { error: entry.error } : {}),
    };

    if (!this.opts.enabled) {
      logger.debug("telemetry disabled; trace not persisted", { tool: record.tool });
      return;
    }

    try {
      if (!this.dirReady) {
        await mkdir(dirname(this.opts.path), { recursive: true });
        this.dirReady = true;
      }
      await appendFile(this.opts.path, `${JSON.stringify(record)}\n`, "utf8");
    } catch (err) {
      logger.error("failed to write trace record", {
        error: err instanceof Error ? err.message : String(err),
        path: this.opts.path,
      });
    }
  }
}
