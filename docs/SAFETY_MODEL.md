# Safety Model

> This is a risk-reduction layer, not a security boundary or sandbox. A
> connected client can do anything a logged-in user could. Run in trusted
> environments and start with `CUA_DRY_RUN=true`.

## Risk tiers

Ordered low → high: `safe` < `low` < `medium` < `high` < `critical`.

- `safe`: screenshots, cursor/screen/window reads
- `low`: mouse move, scroll, click, drag
- `medium`: type, key
- `high` / `critical`: reached via rule escalation (see below)

The default ceiling is `CUA_MAX_RISK_TIER=medium`.

## Rules

Rules inspect each action and may **escalate** its tier or **hard-block** it:

- `destructive-payload` — hard-blocks typed payloads containing destructive
  commands (`rm -rf`, `mkfs`, `dd of=/dev/…`, fork bombs, drive formats,
  `curl | sh`, force pushes, power-state changes).
- `sensitive-content` — escalates credential/payment/secret-like payloads
  (passwords, CVV, SSN, seed phrases, card-number-shaped digits) to `high`.
- `dangerous-key-combo` — escalates session/OS shortcuts (Ctrl+Alt+Del,
  Alt+F4, lock, quit) to `high`.

## Policy modes (`CUA_POLICY_MODE`)

Applies to **tier-ceiling** violations (effective tier > max tier):

- `enforce` (default): deny.
- `confirm`: deny and return `confirmation_required` so the agent can re-issue
  after explicit user approval.
- `warn`: allow, attach a warning, and trace it.

Hard content blocks (e.g. `destructive-payload`) **always deny**, regardless of
mode. Every decision — allowed, blocked, or confirmation-gated — is traced.

## Windows backend limitations

- It **cannot** automate elevated/UAC windows or the Secure Desktop (e.g. the
  UAC prompt, the Ctrl+Alt+Del / lock screen). The OS isolates these from
  unprivileged input injection by design.
- SendInput is **focus-dependent**: keystrokes go to the currently focused
  window, so input can land on the wrong target if focus changes mid-action.

## Hardening roadmap

1. App allow/block lists.
2. Password-field detection via accessibility backends.
3. Authentication for the HTTP transport before any network exposure.
4. Screen-redaction hooks.
5. Sandbox-account setup guide.
