import { describe, expect, it } from "vitest";

import { PolicyEngine } from "./policy.js";
import type { RiskTier } from "../types.js";

const engine = (maxTier: RiskTier) => new PolicyEngine({ maxTier });

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
