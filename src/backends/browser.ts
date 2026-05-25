// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import type { MouseButton, Point, Size, WindowInfo } from "../types.js";
import {
  type ComputerBackend,
  type ScreenshotRequest,
  type ScreenshotResult,
  CapabilityNotImplementedError,
} from "./backend.js";

/**
 * Boundary placeholder for a browser-driven backend (CDP / Playwright).
 *
 * The shape is intentionally identical to native backends so a future
 * implementation can drop in behind the same tool surface. Methods reject
 * with CapabilityNotImplementedError until wired to a driver.
 */
export class BrowserBackend implements ComputerBackend {
  readonly name = "browser";
  readonly platform = "browser";

  async isAvailable(): Promise<{ ok: boolean; detail: string }> {
    return { ok: false, detail: "browser backend is a boundary stub (no driver wired)" };
  }

  private nope(capability: string): Promise<never> {
    return Promise.reject(new CapabilityNotImplementedError(this.name, capability));
  }

  getScreenSize(): Promise<Size> {
    return this.nope("getScreenSize");
  }
  cursorPosition(): Promise<Point> {
    return this.nope("cursorPosition");
  }
  screenshot(_req: ScreenshotRequest): Promise<ScreenshotResult> {
    return this.nope("screenshot");
  }
  moveMouse(_p: Point): Promise<void> {
    return this.nope("moveMouse");
  }
  click(_p: Point | undefined, _button: MouseButton, _count: number): Promise<void> {
    return this.nope("click");
  }
  drag(_to: Point): Promise<void> {
    return this.nope("drag");
  }
  typeText(_text: string): Promise<void> {
    return this.nope("typeText");
  }
  key(_combo: string): Promise<void> {
    return this.nope("key");
  }
  scroll(_p: Point | undefined, _dx: number, _dy: number): Promise<void> {
    return this.nope("scroll");
  }
  windows(): Promise<WindowInfo[]> {
    return this.nope("windows");
  }
  activeWindow(): Promise<WindowInfo | null> {
    return this.nope("activeWindow");
  }
}
