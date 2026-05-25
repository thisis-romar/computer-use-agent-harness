# 🦺🤖Computer Use Agent Harness🛳️🧑‍✈️

A hardened MCP computer-use server for safe, observable, high-performance AI desktop automation.

`computer-use-agent-harness` is a TypeScript-first [Model Context Protocol](https://modelcontextprotocol.io)
server for AI-driven desktop control. It extends the lightweight computer-use
MCP pattern into a full agent harness with structured tools, risk-tier policy
enforcement, action tracing, screenshot metadata, region/zoom capture, and
native-backend boundaries for Windows, macOS, Linux, browser automation, and
future accessibility-tree integrations.

> [!WARNING]
> **This software can control your computer.** It moves the mouse, types
> keystrokes, presses key combinations, and captures your screen. Run it only
> in environments you understand and trust. The bundled policy engine blocks a
> conservative set of obviously destructive actions — it is **not** a security
> boundary or a sandbox. Treat every connected client as capable of doing
> anything a logged-in user could do. Start with `CUA_DRY_RUN=true` and the
> default `CUA_MAX_RISK_TIER=medium` until you trust the calling agent.

## Features

- **STDIO MCP server** built on `@modelcontextprotocol/sdk`.
- **Structured tools** for screenshots, mouse, keyboard, and scroll with typed
  inputs (zod) and structured outputs.
- **Risk-tier policy engine** (`safe` → `low` → `medium` → `high` → `critical`)
  that escalates and blocks dangerous actions deterministically.
- **JSONL action tracing** — one valid JSON record per invocation, with payload
  redaction by default.
- **Zoom- and region-aware screenshots** with stable metadata (logical region,
  screen size, pixel size, scale, zoom).
- **Pluggable native backends** behind a single interface: Linux/X11, macOS,
  Windows, plus boundary stubs for browser and accessibility-tree drivers.
- **Dry-run mode** so the full tool → policy → telemetry path runs in headless
  CI without touching a real desktop.

## Installation

```bash
npm install
npm run build
```

Requires Node.js >= 20.

### Native backend prerequisites

The server selects a backend by host platform (override with `CUA_BACKEND`).

| Platform | Capture | Input | Install |
| --- | --- | --- | --- |
| Linux/X11 | ImageMagick `import` or `scrot` | `xdotool` | `apt install xdotool imagemagick` (needs a reachable `$DISPLAY`) |
| macOS | `screencapture` / `sips` (built-in) | `cliclick` | `brew install cliclick` (+ Accessibility permission) |
| Windows | PowerShell + System.Drawing | PowerShell + SendKeys / Win32 | built-in |

`browser` and `accessibility` backends are interface-complete boundary stubs;
they report unavailable until a driver is wired in.

## Running

```bash
# Start the STDIO server
npm start

# Develop without building
npm run dev

# In-process smoke test (no MCP client needed)
npm run smoke
```

### Use in Claude Desktop / Cursor

Add to your MCP client config (adjust the path):

```json
{
  "mcpServers": {
    "computer-use": {
      "command": "node",
      "args": ["/absolute/path/to/computer-use-agent-harness/dist/index.js"],
      "env": {
        "CUA_DRY_RUN": "true",
        "CUA_MAX_RISK_TIER": "medium"
      }
    }
  }
}
```

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `CUA_TRANSPORT` | `stdio` | `stdio` or `http` |
| `CUA_HTTP_PORT` | `3099` | Port for the HTTP transport |
| `CUA_BACKEND` | `auto` | `auto`, `linux`, `macos`, `windows`, `browser`, `accessibility`, `dry-run` |
| `CUA_DRY_RUN` | `false` | Simulate mutating actions; screenshots return synthetic PNGs |
| `CUA_MAX_RISK_TIER` | `medium` | Highest tier the policy will permit |
| `CUA_POLICY_MODE` | `enforce` | Tier-ceiling posture: `enforce`, `warn`, or `confirm` |
| `CUA_SCREENSHOT_DELAY_MS` | `150` | Pre-capture settle delay |
| `CUA_MAX_IMAGE_LONG_EDGE` | `1568` | Downscale budget: longest edge (px) |
| `CUA_MAX_IMAGE_PIXELS` | `1205862` | Downscale budget: total pixels |
| `CUA_TELEMETRY_ENABLED` | `true` | Write JSONL traces |
| `CUA_TELEMETRY_PATH` | `traces/actions-<date>.jsonl` | Trace file path |
| `CUA_REDACT_PAYLOADS` | `true` | Store `redacted(len,sha256)` instead of raw typed text |
| `CUA_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` (stderr only) |

### HTTP transport

```bash
CUA_TRANSPORT=http CUA_HTTP_PORT=3099 node dist/index.js
# POST /mcp for JSON-RPC, GET /health for a liveness probe
```

The HTTP transport ships with **no built-in authentication** — put it behind a
secure proxy before exposing it.

## Tools

| Tool | Tier | Description |
| --- | --- | --- |
| `computer` | varies | Compatibility multi-action tool (Anthropic computer-use action set) |
| `harness_status` | safe | Config, backend availability, policy, telemetry target |
| `policy_describe` / `computer_policy_status` | safe | Mode, max tier, and active rules |
| `computer_trace_status` | safe | Telemetry recorder status |
| `computer_screen_info` | safe | Primary screen size |
| `computer_cursor_position` | safe | Current cursor position |
| `computer_window_list` | safe | Visible windows (backend-permitting) |
| `computer_active_window` | safe | Focused window (backend-permitting) |
| `computer_screenshot` | safe | PNG capture with `region` and `zoom`, plus metadata |
| `computer_screenshot_region` | safe | Region capture |
| `computer_zoom_region` | safe | Region capture magnified for dense UI |
| `computer_move_mouse` | low | Move cursor to `x,y` |
| `computer_click` | low | `button` × `count` click, optional `x,y` |
| `computer_drag` | low | Press-drag from cursor to `x,y` |
| `computer_scroll` | low | Wheel `dx,dy`, optional `x,y` |
| `computer_type` | medium | Type `text` (escalated/blocked if destructive/sensitive) |
| `computer_key` | medium | Press `keys` combo (e.g. `ctrl+c`; OS combos escalate) |

## Policy engine

Each action carries a base risk tier. Rules may **escalate** the effective
tier or **hard-block** an action. An action is denied when it is hard-blocked
or when its effective tier exceeds `CUA_MAX_RISK_TIER`. Built-in rules:

- `destructive-payload` — hard-blocks typed payloads matching destructive
  commands (`rm -rf`, `mkfs`, `dd of=/dev/…`, fork bombs, drive formats,
  `curl | sh`, force pushes, power-state changes).
- `sensitive-content` — escalates credential/payment/secret-like payloads
  (passwords, CVV, SSN, seed phrases, card-number-shaped digits) to `high`.
- `dangerous-key-combo` — escalates session/OS shortcuts (Ctrl+Alt+Del, Alt+F4,
  lock screen, quit) to `high`.

`CUA_POLICY_MODE` controls how **tier-ceiling** violations are handled:
`enforce` denies (default), `confirm` returns `confirmation_required`, and
`warn` allows with a warning. Hard content blocks always deny regardless of
mode. Blocked and confirmation-gated actions are still traced (with
`status: "blocked"` / `"confirm"`) so refusals are auditable.

## Telemetry

Every invocation appends one JSON line to the trace file:

```json
{"ts":"2026-05-25T18:00:00.000Z","sessionId":"…","seq":0,"tool":"computer_type","status":"blocked","durationMs":0,"policy":{"allowed":false,"effectiveTier":"critical","maxTier":"medium","firedRules":["destructive-payload"],"reason":"Blocked: recursive force file deletion"},"args":{"text":"redacted(len=27,sha256=…)"}}
```

## Architecture

```
src/
  index.ts            entry point + CLI (--self-test) + STDIO transport
  server.ts           assembles McpServer, policy, tracer, backend
  tools.ts            tool definitions; policy-gates and traces every call
  config.ts           env-driven configuration
  policy/             risk-tier engine + rules
  telemetry/          JSONL tracer with redaction
  capture/            PNG metadata helpers
  backends/           ComputerBackend interface + linux/macos/windows/
                      browser/accessibility/dry-run implementations
```

## Development

```bash
npm run typecheck
npm test
```

Optional: build a codebase knowledge graph with [graphify](https://github.com/safishamsi/graphify) —
see [CONTRIBUTING.md](./CONTRIBUTING.md#optional-codebase-knowledge-graph-graphify).

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Because the
project is dual-licensed, contributions are accepted under AGPL-3.0-only **and**
a CLA grant that lets Emblem Projects relicense them commercially. Sign off your
commits with `git commit -s` (DCO).

## Security

This software can control a desktop. Report vulnerabilities **privately** per
[SECURITY.md](./SECURITY.md) — do not open public issues for security reports.
Maintainers: see [docs/REPO-HARDENING.md](./docs/REPO-HARDENING.md) for the
pre-public branch-protection and security checklist.

## License

`computer-use-agent-harness` is **dual-licensed**:

- **Open source:** [GNU AGPL-3.0-only](./LICENSE). You may use, modify, and
  redistribute under the AGPL. Note **AGPL §13**: if you run a modified version
  to provide a service over a network (e.g. the HTTP transport), you must offer
  the complete corresponding source to that service's users.
- **Commercial:** a separate commercial license removes the AGPL copyleft and
  network-source obligations for closed-source or hosted-service use. See
  [LICENSE-COMMERCIAL.md](./LICENSE-COMMERCIAL.md).

Copyright (c) 2026 Emblem Projects (GitHub: `emblem-NLP`).
Commercial-license inquiries: **admin+github@emblemprojects.com**.
