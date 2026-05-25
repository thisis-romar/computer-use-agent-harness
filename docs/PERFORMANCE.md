# Performance

## Implemented

- Region screenshot (`computer_screenshot_region`, `region` arg)
- Zoom-aware capture (`computer_zoom_region`, `zoom` arg)
- Per-capture telemetry: `captureMs`, `encodeMs`, `byteSize`, `imageHash`
- Configurable pre-capture settle delay (`CUA_SCREENSHOT_DELAY_MS`)
- Image budget with best-effort downscale (`CUA_MAX_IMAGE_LONG_EDGE`,
  `CUA_MAX_IMAGE_PIXELS`)
- Dependency-free PNG dimension reading (IHDR parse)
- Per-monitor-DPI-v2 model for correct coordinates under display scaling
  (Windows backend)
- Multi-monitor capture across the VirtualScreen (Windows backend)
- Coordinate metadata contract (see below)

## Planned

- Screenshot dirty-region detection / dedupe via `imageHash`
- Adaptive PNG/JPEG/WebP encoding
- Accessibility-tree targeting; browser DOM helpers
- Benchmark suite

## Screenshot metadata contract

Every visual result includes:

```json
{
  "region": { "x": 0, "y": 0, "width": 1920, "height": 1080 },
  "screenSize": { "width": 1920, "height": 1080 },
  "pixelSize": { "width": 1280, "height": 720 },
  "scale": 0.667,
  "scaleX": 0.667,
  "scaleY": 0.667,
  "zoom": 1,
  "cropOrigin": { "x": 0, "y": 0 },
  "monitorId": "primary",
  "captureMs": 24,
  "encodeMs": 6,
  "byteSize": 312000,
  "imageHash": "a1b2c3d4e5f60718",
  "withinBudget": true,
  "downscaled": true,
  "capturedAt": "2026-05-25T00:00:00.000Z"
}
```
