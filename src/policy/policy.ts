// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import type { PolicyMode } from "../config.js";
import { type ActionDescriptor, type RiskTier, tierRank } from "../types.js";
import { defaultRules, type PolicyRule } from "./rules.js";

export interface PolicyDecision {
  allowed: boolean;
  /** True when the action is denied pending out-of-band confirmation. */
  confirmationRequired: boolean;
  /** Effective tier after applying rule escalations. */
  effectiveTier: RiskTier;
  baseTier: RiskTier;
  maxTier: RiskTier;
  mode: PolicyMode;
  /** Rule ids that fired during evaluation. */
  firedRules: string[];
  reason: string;
  /** Advisory warning surfaced to the caller (notably in warn mode). */
  warning?: string;
}

export interface PolicyEngineOptions {
  maxTier: RiskTier;
  mode?: PolicyMode;
  rules?: PolicyRule[];
}

/**
 * Deterministic risk-tier policy engine.
 *
 * Evaluation order:
 *   1. Start from the action's base tier.
 *   2. Apply every rule; rules may escalate the tier or hard-block.
 *   3. Deny if hard-blocked, or if the effective tier exceeds maxTier.
 */
export class PolicyEngine {
  private readonly maxTier: RiskTier;
  private readonly mode: PolicyMode;
  private readonly rules: PolicyRule[];

  constructor(options: PolicyEngineOptions) {
    this.maxTier = options.maxTier;
    this.mode = options.mode ?? "enforce";
    this.rules = options.rules ?? defaultRules;
  }

  describe(): {
    maxTier: RiskTier;
    mode: PolicyMode;
    rules: Array<{ id: string; description: string }>;
  } {
    return {
      maxTier: this.maxTier,
      mode: this.mode,
      rules: this.rules.map((r) => ({ id: r.id, description: r.description })),
    };
  }

  evaluate(action: ActionDescriptor): PolicyDecision {
    let effectiveTier = action.baseTier;
    let blocked = false;
    const firedRules: string[] = [];
    const reasons: string[] = [];

    for (const rule of this.rules) {
      const verdict = rule.evaluate(action);
      if (!verdict) continue;
      firedRules.push(rule.id);
      reasons.push(verdict.reason);
      if (verdict.escalateTo && tierRank(verdict.escalateTo) > tierRank(effectiveTier)) {
        effectiveTier = verdict.escalateTo;
      }
      if (verdict.block) {
        blocked = true;
      }
    }

    const exceedsMax = tierRank(effectiveTier) > tierRank(this.maxTier);

    // Hard blocks always deny. Tier-ceiling violations follow the mode.
    let allowed: boolean;
    let confirmationRequired = false;
    let warning: string | undefined;
    if (blocked) {
      allowed = false;
    } else if (exceedsMax) {
      if (this.mode === "warn") {
        allowed = true;
        warning = `Allowed ${effectiveTier} action above maximum "${this.maxTier}" (CUA_POLICY_MODE=warn)`;
      } else {
        allowed = false;
        confirmationRequired = this.mode === "confirm";
      }
    } else {
      allowed = true;
    }

    let reason: string;
    if (blocked) {
      reason = reasons.join("; ");
    } else if (exceedsMax && !allowed) {
      reason = `Action tier "${effectiveTier}" exceeds configured maximum "${this.maxTier}"`;
      if (confirmationRequired) reason += " (confirmation required)";
      if (reasons.length > 0) reason += ` (${reasons.join("; ")})`;
    } else if (warning) {
      reason = warning;
    } else {
      reason = reasons.length > 0 ? reasons.join("; ") : "Within configured policy";
    }

    return {
      allowed,
      confirmationRequired,
      effectiveTier,
      baseTier: action.baseTier,
      maxTier: this.maxTier,
      mode: this.mode,
      firedRules,
      reason,
      ...(warning ? { warning } : {}),
    };
  }
}
