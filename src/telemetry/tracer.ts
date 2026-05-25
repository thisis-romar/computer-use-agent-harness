import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { PolicyDecision } from "../policy/policy.js";
import { logger } from "../logger.js";

export interface TraceRecord {
  ts: string;
  sessionId: string;
  seq: number;
  tool: string;
  status: "executed" | "blocked" | "error" | "dry-run";
  durationMs: number;
  policy: {
    allowed: boolean;
    effectiveTier: string;
    maxTier: string;
    firedRules: string[];
    reason: string;
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

  /** Redact a free-text payload to a stable, non-reversible descriptor. */
  redact(payload: string | undefined): string | undefined {
    if (payload === undefined) return undefined;
    if (!this.opts.redactPayloads) return payload;
    const hash = createHash("sha256").update(payload).digest("hex").slice(0, 12);
    return `redacted(len=${payload.length},sha256=${hash})`;
  }

  async record(
    entry: Omit<TraceRecord, "ts" | "sessionId" | "seq"> & {
      policy: PolicyDecision | TraceRecord["policy"];
    },
  ): Promise<void> {
    const policy: TraceRecord["policy"] =
      "baseTier" in entry.policy
        ? {
            allowed: entry.policy.allowed,
            effectiveTier: entry.policy.effectiveTier,
            maxTier: entry.policy.maxTier,
            firedRules: entry.policy.firedRules,
            reason: entry.policy.reason,
          }
        : entry.policy;

    const record: TraceRecord = {
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
