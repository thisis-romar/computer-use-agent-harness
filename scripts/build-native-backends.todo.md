# Native backend TODO

The current backends shell out to platform tools (`xdotool`, `screencapture` +
`cliclick`, PowerShell). For higher fidelity / determinism, replace or augment
them with native sidecars behind the same `ComputerBackend` interface.

## Windows UI Automation sidecar (C#)

- UI Automation tree walk
- active-window bounds + focused-element metadata
- per-monitor DPI
- click element by AutomationId

## Rust capture sidecar

- fast full-screen and region capture
- image diff/hash (feeds `imageHash` dedupe)
- adaptive PNG/JPEG/WebP encoding

## Browser backend (`src/backends/browser.ts`)

- wire a CDP / Playwright driver
- DOM clickable-element enumeration; structural targeting

## Accessibility backend (`src/backends/accessibility.ts`)

- AT-SPI (Linux) / AX (macOS) / UIA (Windows) tree
- resolve targets by role + name instead of pixels
