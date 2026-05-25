import { type ActionDescriptor, type RiskTier, tierRank } from "../types.js";
import { defaultRules, type PolicyRule } from "./rules.js";

export interface PolicyDecision {
  allowed: boolean;
  /** Effective tier after applying rule escalations. */
  effectiveTier: RiskTier;
  baseTier: RiskTier;
  maxTier: RiskTier;
  /** Rule ids that fired during evaluation. */
  firedRules: string[];
  reason: string;
}

export interface PolicyEngineOptions {
  maxTier: RiskTier;
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
  private readonly rules: PolicyRule[];

  constructor(options: PolicyEngineOptions) {
    this.maxTier = options.maxTier;
    this.rules = options.rules ?? defaultRules;
  }

  describe(): { maxTier: RiskTier; rules: Array<{ id: string; description: string }> } {
    return {
      maxTier: this.maxTier,
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
    const allowed = !blocked && !exceedsMax;

    let reason: string;
    if (blocked) {
      reason = reasons.join("; ");
    } else if (exceedsMax) {
      reason = `Action tier "${effectiveTier}" exceeds configured maximum "${this.maxTier}"`;
      if (reasons.length > 0) reason += ` (${reasons.join("; ")})`;
    } else {
      reason = reasons.length > 0 ? reasons.join("; ") : "Within configured policy";
    }

    return {
      allowed,
      effectiveTier,
      baseTier: action.baseTier,
      maxTier: this.maxTier,
      firedRules,
      reason,
    };
  }
}
