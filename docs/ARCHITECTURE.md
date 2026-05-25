# Architecture

## Layer model

```text
MCP Host (Claude Desktop / Claude Code / Cursor / Cline)
        ↓  STDIO or Streamable HTTP
Computer Use Agent Harness MCP Server  (src/server.ts)
        ↓
Tool Router + guards                   (src/tools.ts)
        ↓
Policy Engine                          (src/policy/)
        ↓
Telemetry Tracer (JSONL)               (src/telemetry/)
        ↓
Desktop Backend interface              (src/backends/backend.ts)
        ↓
windows / browser* / accessibility* / dry-run
```

`*` = boundary stub (interface-complete, no driver wired yet).

The harness is **Windows-first**: `windows` is the only implemented native
backend (PowerShell + Win32 P/Invoke, per-monitor DPI, multi-monitor capture,
SendInput). On non-Windows hosts, `auto` falls back to the browser stub and
`dry-run` simulates actions for dev/CI.

## Design goals

1. TypeScript-first MCP surface; `npm`/`npx` distribution.
2. Real OS automation through a small, dependency-light backend (Windows
   PowerShell + Win32 P/Invoke) rather than heavyweight native modules.
3. Every tool call flows through policy evaluation and produces exactly one
   JSONL trace record.
4. Screenshots are small, metadata-rich, and coordinate-safe.
5. A `dry-run` mode keeps the full tool → policy → telemetry path exercisable
   in headless CI.

## Request lifecycle

1. A tool handler builds an `ActionDescriptor` (tool, base risk tier, summary,
   optional payload/target).
2. `guarded()` evaluates policy. On deny it traces and returns a `blocked` (or
   `confirmation_required`) result; it never touches the backend.
3. On allow it invokes the backend, measures duration, traces `executed`
   (or `dry-run`), and attaches any advisory warning.

## Tool families

- Compatibility: `computer`
- Visual: `computer_screenshot`, `computer_screenshot_region`, `computer_zoom_region`
- Input: `computer_click`, `computer_drag`, `computer_key`, `computer_type`, `computer_scroll`, `computer_move_mouse`
- State: `computer_cursor_position`, `computer_window_list`, `computer_active_window`, `computer_screen_info`
- Harness: `harness_status`, `policy_describe`, `computer_policy_status`, `computer_trace_status`
