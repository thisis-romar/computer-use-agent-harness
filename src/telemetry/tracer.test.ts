// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PolicyEngine } from "../policy/policy.js";
import { Tracer } from "./tracer.js";

const decision = () =>
  new PolicyEngine({ maxTier: "medium", mode: "enforce" }).evaluate({
    tool: "computer_type",
    baseTier: "safe",
    summary: "s",
  });

const tmpFiles: string[] = [];
afterEach(async () => {
  await Promise.all(tmpFiles.map((f) => rm(f, { force: true }).catch(() => undefined)));
  tmpFiles.length = 0;
});

describe("Tracer.redact", () => {
  it("hashes and length-tags payloads when redaction is on", () => {
    const t = new Tracer({ enabled: false, path: "unused", redactPayloads: true });
    expect(t.redact("hello")).toMatch(/^redacted\(len=5,sha256=[0-9a-f]{12}\)$/);
  });

  it("passes payloads through when redaction is off", () => {
    const t = new Tracer({ enabled: false, path: "unused", redactPayloads: false });
    expect(t.redact("hello")).toBe("hello");
    expect(t.redact(undefined)).toBeUndefined();
  });
});

describe("Tracer.record", () => {
  it("appends one valid JSONL record with the full schema", async () => {
    const path = join(tmpdir(), `cua-trace-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
    tmpFiles.push(path);
    const t = new Tracer({ enabled: true, path, redactPayloads: true });

    await t.record({ tool: "computer_type", status: "executed", durationMs: 3, policy: decision(), args: { text: t.redact("secret") } });

    const lines = (await readFile(path, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]!);
    expect(rec).toMatchObject({ seq: 0, tool: "computer_type", status: "executed", durationMs: 3 });
    expect(typeof rec.id).toBe("string");
    expect(typeof rec.ts).toBe("string");
    expect(rec.sessionId).toBe(t.sessionId);
    expect(rec.policy).toMatchObject({ allowed: true, mode: "enforce", maxTier: "medium" });
    expect(rec.args.text).toMatch(/^redacted\(/);
  });

  it("increments seq and respects the disabled flag", async () => {
    const t = new Tracer({ enabled: false, path: join(tmpdir(), "should-not-exist.jsonl"), redactPayloads: true });
    await t.record({ tool: "a", status: "executed", durationMs: 0, policy: decision(), args: {} });
    await t.record({ tool: "b", status: "executed", durationMs: 0, policy: decision(), args: {} });
    expect(t.status().recorded).toBe(2);
  });
});
