/** Shared geometric and action primitives used across the harness. */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MouseButton = "left" | "right" | "middle";

export interface WindowInfo {
  id: string;
  title: string;
  app?: string;
  bounds?: Region;
  focused?: boolean;
}

/** Ordered, comparable risk tiers. Higher index == higher risk. */
export const RISK_TIERS = ["safe", "low", "medium", "high", "critical"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export function tierRank(tier: RiskTier): number {
  return RISK_TIERS.indexOf(tier);
}

/** A normalized description of an action a tool intends to perform. */
export interface ActionDescriptor {
  /** Tool name that produced this action (e.g. "computer_click"). */
  tool: string;
  /** Baseline risk tier for the action before rule escalation. */
  baseTier: RiskTier;
  /** Free-form sanitized summary for telemetry and policy matching. */
  summary: string;
  /**
   * Text payload the action would inject (typed text, key combos, etc.).
   * Used by content-scanning policy rules. May be redacted before logging.
   */
  payload?: string;
  /** Target region/point, when applicable, for spatial policy rules. */
  target?: Point | Region;
}
