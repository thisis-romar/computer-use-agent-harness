import { readPngSize, syntheticPng } from "../capture/screenshot.js";
import { logger } from "../logger.js";
import type { MouseButton, Point, Region, Size } from "../types.js";
import type {
  ComputerBackend,
  ScreenshotRequest,
  ScreenshotResult,
} from "./backend.js";

const SYNTHETIC_SCREEN: Size = { width: 1920, height: 1080 };

/**
 * Wraps a real backend (or stands alone) so that mutating actions are logged
 * but never dispatched to the OS. Screenshots return a valid synthetic PNG
 * with correct metadata. This keeps the full tool + policy + telemetry path
 * exercisable in headless CI and during local development.
 */
export class DryRunBackend implements ComputerBackend {
  readonly name: string;
  readonly platform = "dry-run";
  private readonly inner?: ComputerBackend;

  constructor(inner?: ComputerBackend) {
    this.inner = inner;
    this.name = inner ? `dry-run(${inner.name})` : "dry-run";
  }

  async isAvailable(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: this.inner ? `wrapping ${this.inner.name}` : "standalone" };
  }

  async getScreenSize(): Promise<Size> {
    if (this.inner) {
      try {
        return await this.inner.getScreenSize();
      } catch {
        /* fall through to synthetic */
      }
    }
    return SYNTHETIC_SCREEN;
  }

  async cursorPosition(): Promise<Point> {
    return { x: 0, y: 0 };
  }

  async screenshot(req: ScreenshotRequest): Promise<ScreenshotResult> {
    const screenSize = await this.getScreenSize();
    const region: Region = req.region ?? { x: 0, y: 0, ...screenSize };
    const zoom = req.zoom && req.zoom > 0 ? req.zoom : 1;
    const png = syntheticPng();
    logger.debug("dry-run screenshot", { region, zoom });
    return {
      base64: png.toString("base64"),
      mimeType: "image/png",
      region,
      screenSize,
      pixelSize: readPngSize(png),
      scale: zoom,
      zoom,
      capturedAt: new Date().toISOString(),
    };
  }

  async moveMouse(p: Point): Promise<void> {
    logger.debug("dry-run moveMouse", { ...p });
  }

  async click(p: Point | undefined, button: MouseButton, count: number): Promise<void> {
    logger.debug("dry-run click", { p, button, count });
  }

  async typeText(text: string): Promise<void> {
    logger.debug("dry-run typeText", { length: text.length });
  }

  async key(combo: string): Promise<void> {
    logger.debug("dry-run key", { combo });
  }

  async scroll(p: Point | undefined, dx: number, dy: number): Promise<void> {
    logger.debug("dry-run scroll", { p, dx, dy });
  }
}
