import type { MouseButton, Point, Size } from "../types.js";
import {
  type ComputerBackend,
  type ScreenshotRequest,
  type ScreenshotResult,
  CapabilityNotImplementedError,
} from "./backend.js";

/**
 * Boundary placeholder for an accessibility-tree backend (UIA / AX / AT-SPI).
 *
 * Unlike pixel-based backends, a future implementation here would resolve
 * targets by semantic role/name rather than coordinates. The interface is kept
 * uniform so the harness can route to it without special-casing.
 */
export class AccessibilityBackend implements ComputerBackend {
  readonly name = "accessibility";
  readonly platform = "accessibility";

  async isAvailable(): Promise<{ ok: boolean; detail: string }> {
    return { ok: false, detail: "accessibility-tree backend is a boundary stub" };
  }

  private nope(capability: string): never {
    throw new CapabilityNotImplementedError(this.name, capability);
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
  typeText(_text: string): Promise<void> {
    return this.nope("typeText");
  }
  key(_combo: string): Promise<void> {
    return this.nope("key");
  }
  scroll(_p: Point | undefined, _dx: number, _dy: number): Promise<void> {
    return this.nope("scroll");
  }
}
