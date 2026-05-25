# Native backend TODO

The supported backend is Windows (PowerShell + Win32 P/Invoke). For higher
fidelity / determinism, replace or augment it with native sidecars behind the
same `ComputerBackend` interface.

## Windows UI Automation sidecar (C#)

- UI Automation tree walk
- active-window bounds + focused-element metadata
- click element by AutomationId

(Per-monitor-DPI awareness, multi-monitor VirtualScreen capture, and SendInput
input are already implemented in the PowerShell + Win32 backend.)

## Rust capture sidecar

- fast full-screen and region capture
- image diff/hash (feeds `imageHash` dedupe)
- adaptive PNG/JPEG/WebP encoding

## Browser backend (`src/backends/browser.ts`)

- wire a CDP / Playwright driver
- DOM clickable-element enumeration; structural targeting

## Accessibility backend (`src/backends/accessibility.ts`)

- Windows UI Automation (UIA) tree
- resolve targets by role + name instead of pixels
