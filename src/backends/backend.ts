// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import type { MouseButton, Point, Region, Size, WindowInfo } from "../types.js";

export interface ScreenshotRequest {
  /** Logical region to capture. Defaults to the full primary screen. */
  region?: Region;
  /**
   * Zoom factor applied to the captured region. Values > 1 magnify a smaller
   * logical area into a larger image; the metadata always records the mapping.
   */
  zoom?: number;
  /** Pre-capture settle delay (ms). */
  delayMs?: number;
  /** Downscale budget: longest edge in pixels. */
  maxLongEdge?: number;
  /** Downscale budget: total pixel count. */
  maxPixels?: number;
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
  /** Device/zoom scale factor: pixelSize.width / region.width (alias of scaleX). */
  scale: number;
  scaleX: number;
  scaleY: number;
  /** Requested zoom factor (1 == native). */
  zoom: number;
  /** Logical origin of the captured crop. */
  cropOrigin: Point;
  /** Identifier of the monitor the capture came from. */
  monitorId: string;
  /** Milliseconds spent acquiring the raw image. */
  captureMs: number;
  /** Milliseconds spent encoding / downscaling. */
  encodeMs: number;
  /** Encoded byte size of the returned image. */
  byteSize: number;
  /** Short sha256 prefix of the encoded image, for dedupe/diffing. */
  imageHash: string;
  /** Whether the image fit (or was made to fit) the configured budget. */
  withinBudget: boolean;
  /** Whether a downscale was applied to satisfy the budget. */
  downscaled: boolean;
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
  /** Press-drag from the current cursor position to `to`. */
  drag(to: Point): Promise<void>;
  typeText(text: string): Promise<void>;
  key(combo: string): Promise<void>;
  scroll(p: Point | undefined, dx: number, dy: number): Promise<void>;
  /** List visible windows, when the backend supports it. */
  windows(): Promise<WindowInfo[]>;
  /** Return the focused window, or null when unsupported/none. */
  activeWindow(): Promise<WindowInfo | null>;
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
