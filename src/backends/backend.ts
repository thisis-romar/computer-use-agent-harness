import type { MouseButton, Point, Region, Size } from "../types.js";

export interface ScreenshotRequest {
  /** Logical region to capture. Defaults to the full primary screen. */
  region?: Region;
  /**
   * Zoom factor applied to the captured region. Values > 1 magnify a smaller
   * logical area into a larger image; the metadata always records the mapping.
   */
  zoom?: number;
}

export interface ScreenshotResult {
  /** Base64-encoded image bytes. */
  base64: string;
  mimeType: "image/png";
  /** Logical region that was captured. */
  region: Region;
  /** Full logical screen size. */
  screenSize: Size;
  /** Pixel dimensions of the returned image. */
  pixelSize: Size;
  /** Device/zoom scale factor: pixelSize / region. */
  scale: number;
  /** Requested zoom factor (1 == native). */
  zoom: number;
  capturedAt: string;
}

/**
 * A native desktop automation backend. Implementations translate normalized
 * harness actions into platform-specific calls. All methods reject with a
 * descriptive Error when the underlying capability is unavailable.
 */
export interface ComputerBackend {
  readonly name: string;
  readonly platform: string;
  /** Cheap probe: are the required native tools present and usable? */
  isAvailable(): Promise<{ ok: boolean; detail: string }>;
  getScreenSize(): Promise<Size>;
  cursorPosition(): Promise<Point>;
  screenshot(req: ScreenshotRequest): Promise<ScreenshotResult>;
  moveMouse(p: Point): Promise<void>;
  click(p: Point | undefined, button: MouseButton, count: number): Promise<void>;
  typeText(text: string): Promise<void>;
  key(combo: string): Promise<void>;
  scroll(p: Point | undefined, dx: number, dy: number): Promise<void>;
}

export class BackendUnavailableError extends Error {
  constructor(backend: string, detail: string) {
    super(`Backend "${backend}" is unavailable: ${detail}`);
    this.name = "BackendUnavailableError";
  }
}

export class CapabilityNotImplementedError extends Error {
  constructor(backend: string, capability: string) {
    super(`Backend "${backend}" does not implement "${capability}"`);
    this.name = "CapabilityNotImplementedError";
  }
}
