// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { describe, expect, it } from "vitest";

import { PolicyEngine } from "./policy.js";
import type { PolicyMode } from "../config.js";
import type { RiskTier } from "../types.js";

const engine = (maxTier: RiskTier, mode?: PolicyMode) => new PolicyEngine({ maxTier, mode });

describe("PolicyEngine", () => {
  it("allows actions at or below the configured max tier", () => {
    const decision = engine("medium").evaluate({
      tool: "computer_click",
      baseTier: "low",
      summary: "click",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.effectiveTier).toBe("low");
  });

  it("denies actions above the configured max tier", () => {
    const decision = engine("low").evaluate({
      tool: "computer_type",
      baseTier: "medium",
      summary: "type",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/exceeds configured maximum/);
  });

  it("hard-blocks destructive payloads regardless of base tier", () => {
    const decision = engine("critical").evaluate({
      tool: "computer_type",
      baseTier: "medium",
      summary: "type",
      payload: "sudo rm -rf / --no-preserve-root",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.effectiveTier).toBe("critical");
    expect(decision.firedRules).toContain("destructive-payload");
  });

  it("escalates dangerous key combos", () => {
    const decision = engine("medium").evaluate({
      tool: "computer_key",
      baseTier: "medium",
      summary: "key",
      payload: "ctrl+alt+delete",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.effectiveTier).toBe("high");
    expect(decision.firedRules).toContain("dangerous-key-combo");
  });

  it("treats key combos order-independently", () => {
    const decision = engine("high").evaluate({
      tool: "computer_key",
      baseTier: "medium",
      summary: "key",
      payload: "delete+alt+ctrl",
    });
    expect(decision.effectiveTier).toBe("high");
    expect(decision.allowed).toBe(true);
  });
});

describe("policy modes", () => {
  const overTier = () =>
    ({ tool: "computer_type", baseTier: "high", summary: "type" }) as const;

  it("enforce denies tier-ceiling violations", () => {
    const decision = engine("medium", "enforce").evaluate(overTier());
    expect(decision.allowed).toBe(false);
    expect(decision.confirmationRequired).toBe(false);
  });

  it("confirm denies but flags confirmation required", () => {
    const decision = engine("medium", "confirm").evaluate(overTier());
    expect(decision.allowed).toBe(false);
    expect(decision.confirmationRequired).toBe(true);
  });

  it("warn allows with a warning", () => {
    const decision = engine("medium", "warn").evaluate(overTier());
    expect(decision.allowed).toBe(true);
    expect(decision.warning).toMatch(/warn/);
  });

  it("warn never relaxes a hard content block", () => {
    const decision = engine("critical", "warn").evaluate({
      tool: "computer_type",
      baseTier: "medium",
      summary: "type",
      payload: "rm -rf / --no-preserve-root",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.firedRules).toContain("destructive-payload");
  });
});

describe("sensitive content rule", () => {
  it("escalates credential-like payloads to high", () => {
    const decision = engine("critical").evaluate({
      tool: "computer_type",
      baseTier: "medium",
      summary: "type",
      payload: "my password is hunter2",
    });
    expect(decision.effectiveTier).toBe("high");
    expect(decision.firedRules).toContain("sensitive-content");
  });
});
