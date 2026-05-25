# Roadmap

## Phase 0 — Scaffold (done)

- TypeScript MCP server, STDIO + Streamable HTTP transport
- Risk-tier policy engine with warn/confirm/enforce modes
- JSONL telemetry with payload redaction
- Backend interface + real linux/macos/windows shell-out backends
- Compatibility `computer` tool + structured tools
- Dry-run backend and `--self-test`

## Phase 1 — Visual performance (done)

- Region + zoom capture, coordinate remapping
- Rich screenshot metadata + timings
- Image budget + best-effort downscale

## Phase 2 — OS determinism

- Per-monitor DPI model and monitor enumeration
- Window bounds + active-window geometry
- Windows UI Automation sidecar

## Phase 3 — Agent harness features

- Role-scoped subagents (Observer/Planner/Executor/Verifier)
- Progress monitor + same-screen loop detection
- Action checkpoints, verification hooks, rollback where possible

## Phase 4 — Browser structural automation

- Hint-label helper, Playwright/CDP bridge
- DOM clickable-element listing
