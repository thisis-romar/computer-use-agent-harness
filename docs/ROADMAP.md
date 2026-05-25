# Roadmap

## Phase 0 — Scaffold (done)

- TypeScript MCP server, STDIO + Streamable HTTP transport
- Risk-tier policy engine with warn/confirm/enforce modes
- JSONL telemetry with payload redaction
- Backend interface + Windows native backend (PowerShell + Win32 P/Invoke)
- Compatibility `computer` tool + structured tools
- Dry-run backend and `--self-test`

## Phase 1 — Visual performance (done)

- Region + zoom capture, coordinate remapping
- Rich screenshot metadata + timings
- Image budget + best-effort downscale

## Phase 2 — Windows OS determinism (done)

- Per-monitor-DPI-v2 awareness (correct coords under display scaling)
- Multi-monitor (VirtualScreen) capture and monitor enumeration
- SendInput keyboard input (Unicode typing + virtual-key combos)
- Window bounds + active-window geometry

## Phase 3 — Agent harness features

- Role-scoped subagents (Observer/Planner/Executor/Verifier)
- Progress monitor + same-screen loop detection
- Action checkpoints, verification hooks, rollback where possible

## Phase 4 — Browser structural automation

- Hint-label helper, Playwright/CDP bridge
- DOM clickable-element listing

## Possible future — Cross-platform automation

- Native Linux/macOS backends (out of scope for the current Windows-first
  release; revisit once the Windows surface is mature)
