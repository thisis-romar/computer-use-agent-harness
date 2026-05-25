import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readPngSize } from "../capture/screenshot.js";
import type { MouseButton, Point, Region, Size } from "../types.js";
import {
  type ComputerBackend,
  type ScreenshotRequest,
  type ScreenshotResult,
  BackendUnavailableError,
} from "./backend.js";
import { commandExists, run } from "./exec.js";

/**
 * macOS backend. Capture uses the built-in `screencapture`/`sips`; input uses
 * `cliclick` (https://github.com/BlueM/cliclick), which must be installed and
 * granted Accessibility permission.
 */
export class MacosBackend implements ComputerBackend {
  readonly name = "macos";
  readonly platform = "darwin";

  async isAvailable(): Promise<{ ok: boolean; detail: string }> {
    if (process.platform !== "darwin") {
      return { ok: false, detail: `host platform is ${process.platform}, not darwin` };
    }
    if (!(await commandExists("cliclick"))) {
      return { ok: false, detail: "cliclick not found (brew install cliclick)" };
    }
    return { ok: true, detail: "screencapture + cliclick available" };
  }

  private async ensure(): Promise<void> {
    const status = await this.isAvailable();
    if (!status.ok) throw new BackendUnavailableError(this.name, status.detail);
  }

  async getScreenSize(): Promise<Size> {
    await this.ensure();
    const script = 'tell application "Finder" to get bounds of window of desktop';
    const { stdout } = await run("osascript", ["-e", script]);
    const parts = stdout.trim().split(",").map((s) => Number(s.trim()));
    return { width: parts[2] ?? 0, height: parts[3] ?? 0 };
  }

  async cursorPosition(): Promise<Point> {
    await this.ensure();
    const { stdout } = await run("cliclick", ["p"]);
    const [x, y] = stdout.trim().split(",").map(Number);
    return { x: x ?? 0, y: y ?? 0 };
  }

  async screenshot(req: ScreenshotRequest): Promise<ScreenshotResult> {
    await this.ensure();
    const screenSize = await this.getScreenSize();
    const region: Region = req.region ?? { x: 0, y: 0, ...screenSize };
    const zoom = req.zoom && req.zoom > 0 ? req.zoom : 1;
    const out = join(tmpdir(), `cua-shot-${Date.now()}.png`);

    await run("screencapture", [
      "-x",
      "-R",
      `${region.x},${region.y},${region.width},${region.height}`,
      out,
    ]);

    if (zoom !== 1) {
      const w = Math.max(1, Math.round(region.width * zoom));
      const h = Math.max(1, Math.round(region.height * zoom));
      await run("sips", ["-z", String(h), String(w), out]);
    }

    const png = await readFile(out);
    await unlink(out).catch(() => undefined);
    const pixelSize = readPngSize(png);
    return {
      base64: png.toString("base64"),
      mimeType: "image/png",
      region,
      screenSize,
      pixelSize,
      scale: region.width > 0 ? pixelSize.width / region.width : zoom,
      zoom,
      capturedAt: new Date().toISOString(),
    };
  }

  async moveMouse(p: Point): Promise<void> {
    await this.ensure();
    await run("cliclick", [`m:${p.x},${p.y}`]);
  }

  async click(p: Point | undefined, button: MouseButton, count: number): Promise<void> {
    await this.ensure();
    const at = p ? `${p.x},${p.y}` : ".";
    const verb = button === "right" ? "rc" : count >= 2 ? "dc" : "c";
    await run("cliclick", [`${verb}:${at}`]);
  }

  async typeText(text: string): Promise<void> {
    await this.ensure();
    await run("cliclick", [`t:${text}`]);
  }

  async key(combo: string): Promise<void> {
    await this.ensure();
    // cliclick uses key-down/up for modifiers; map "cmd+c" -> kd:cmd c ku:cmd.
    const parts = combo.split("+").map((s) => s.trim().toLowerCase());
    const key = parts.pop() ?? "";
    const mods = parts.join(",");
    if (mods) {
      await run("cliclick", [`kd:${mods}`, `t:${key}`, `ku:${mods}`]);
    } else {
      await run("cliclick", [`kp:${key}`]);
    }
  }

  async scroll(p: Point | undefined, _dx: number, dy: number): Promise<void> {
    await this.ensure();
    if (p) await run("cliclick", [`m:${p.x},${p.y}`]);
    // cliclick lacks a scroll verb; approximate via key presses on a focused view.
    const key = dy >= 0 ? "arrow-down" : "arrow-up";
    for (let i = 0; i < Math.abs(dy); i++) await run("cliclick", [`kp:${key}`]);
  }
}
