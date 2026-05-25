// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import type { ActionDescriptor, RiskTier } from "../types.js";

/**
 * A policy rule inspects an action and may escalate its risk tier or block it
 * outright. Rules are pure functions so they are trivially testable.
 */
export interface PolicyRule {
  id: string;
  description: string;
  evaluate(action: ActionDescriptor): RuleVerdict | null;
}

export interface RuleVerdict {
  /** Escalate the effective tier to at least this value. */
  escalateTo?: RiskTier;
  /** Hard block regardless of the configured maximum tier. */
  block?: boolean;
  reason: string;
}

/**
 * Patterns that indicate a destructive or otherwise dangerous text payload.
 * These are intentionally conservative: they target unambiguous, high-blast
 * commands rather than trying to be a general-purpose content classifier.
 */
const DESTRUCTIVE_PAYLOAD_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i, reason: "recursive force file deletion" },
  { re: /\bmkfs(\.\w+)?\b/i, reason: "filesystem format command" },
  { re: /\bdd\s+if=.*\bof=\/dev\//i, reason: "raw write to block device" },
  { re: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, reason: "shell fork bomb" },
  { re: /\bformat\s+[a-z]:/i, reason: "windows drive format" },
  { re: /\bdel\s+\/[sqf]\b/i, reason: "windows recursive delete" },
  { re: /\bgit\s+push\b.*--force/i, reason: "force push" },
  { re: /\bshutdown\b|\breboot\b|\bhalt\b|\bpoweroff\b/i, reason: "power-state change" },
  { re: /\bcurl\b[^|]*\|\s*(sudo\s+)?(ba)?sh\b/i, reason: "pipe remote script to shell" },
];

/**
 * Key combinations that affect the session/OS rather than the focused app.
 * Stored normalized as a sorted, lowercased set joined by "+".
 */
const DANGEROUS_KEY_COMBOS: Array<{ keys: string[]; reason: string }> = [
  { keys: ["alt", "ctrl", "delete"], reason: "secure attention sequence" },
  { keys: ["alt", "f4"], reason: "force window close" },
  { keys: ["cmd", "ctrl", "power"], reason: "force restart" },
  { keys: ["super", "l"], reason: "lock screen" },
  { keys: ["cmd", "q"], reason: "quit application" },
];

function normalizeCombo(combo: string): string {
  return combo
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("+");
}

export const destructivePayloadRule: PolicyRule = {
  id: "destructive-payload",
  description: "Escalates actions whose text payload contains destructive commands.",
  evaluate(action) {
    if (!action.payload) return null;
    for (const { re, reason } of DESTRUCTIVE_PAYLOAD_PATTERNS) {
      if (re.test(action.payload)) {
        return { escalateTo: "critical", block: true, reason: `Blocked: ${reason}` };
      }
    }
    return null;
  },
};

/**
 * Indicators that a payload involves sensitive data entry (credentials,
 * payment details, secrets). Maps the reference SENSITIVE tier onto our
 * content-driven model by escalating to "high".
 */
const SENSITIVE_PAYLOAD_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bpass(word|wd|phrase)\b/i, reason: "password/passphrase entry" },
  { re: /\b(cvv|cvc|cvv2)\b/i, reason: "card security code" },
  { re: /\b(ssn|social security)\b/i, reason: "government identifier" },
  { re: /\b(seed phrase|mnemonic|private key|secret key|api[_-]?key)\b/i, reason: "secret material" },
  { re: /\b(?:\d[ -]*?){13,16}\b/, reason: "card-number-shaped digits" },
];

export const sensitiveContentRule: PolicyRule = {
  id: "sensitive-content",
  description: "Escalates payloads that resemble credentials, payment data, or secrets.",
  evaluate(action) {
    if (!action.payload) return null;
    for (const { re, reason } of SENSITIVE_PAYLOAD_PATTERNS) {
      if (re.test(action.payload)) {
        return { escalateTo: "high", reason: `Sensitive: ${reason}` };
      }
    }
    return null;
  },
};

export const dangerousKeyComboRule: PolicyRule = {
  id: "dangerous-key-combo",
  description: "Escalates session/OS-level keyboard shortcuts.",
  evaluate(action) {
    if (action.tool !== "computer_key" || !action.payload) return null;
    const normalized = normalizeCombo(action.payload);
    for (const { keys, reason } of DANGEROUS_KEY_COMBOS) {
      if (normalizeCombo(keys.join("+")) === normalized) {
        return { escalateTo: "high", reason: `Escalated: ${reason}` };
      }
    }
    return null;
  },
};

export const defaultRules: PolicyRule[] = [
  destructivePayloadRule,
  sensitiveContentRule,
  dangerousKeyComboRule,
];
