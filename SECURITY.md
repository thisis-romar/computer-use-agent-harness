# Security Policy

`computer-use-agent-harness` can control a desktop — move the mouse, type, press
keys, and capture the screen. Treat security reports here with corresponding
care.

## Reporting a vulnerability

**Please report privately — do not open a public issue for security reports.**

- Email: **admin+github@emblemprojects.com**
- Preferred: GitHub **Security Advisories** (repo → Security → "Report a
  vulnerability") for coordinated disclosure.

Include: affected version/commit, environment (OS, backend), reproduction steps,
impact, and any suggested fix.

### What to expect

- Acknowledgement within **3 business days**.
- A triage assessment and severity within **10 business days**.
- Coordinated disclosure: we will agree on a disclosure timeline with you and
  credit you (if you wish) once a fix is available.

There is **no formal bug-bounty program** at this time.

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | ✅ |
| < 0.1 | ❌ |

## Scope and hardening notes

- The bundled policy engine reduces risk (risk-tier ceilings, destructive-payload
  hard-blocks, sensitive-content escalation, telemetry) but is **not** a
  sandbox or a security boundary — a connected client can do anything a
  logged-in user could. Reports that assume otherwise may be out of scope.
- In scope: policy bypasses, telemetry/redaction leaks, the HTTP transport
  (which ships with **no built-in auth** — keep it behind a secure proxy),
  command-injection in backends, and supply-chain issues.
- Out of scope: actions a user explicitly authorized via an allowed tool within
  policy; missing auth on the HTTP transport when exposed directly (documented).

## Hardening checklist for operators

- Start with `CUA_DRY_RUN=true` and `CUA_POLICY_MODE=enforce`.
- Never expose the HTTP transport without authentication in front of it.
- Run in a dedicated/sandboxed account where feasible.
