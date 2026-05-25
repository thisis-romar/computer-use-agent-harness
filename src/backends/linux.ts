// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { performance } from "node:perf_hooks";

import { finalizeScreenshot, sleep } from "../capture/screenshot.js";
import type { MouseButton, Point, Region, Size, WindowInfo } from "../types.js";
import {
  type ComputerBackend,
  type ScreenshotRequest,
  type ScreenshotResult,
  BackendUnavailableError,
} from "./backend.js";
import { commandExists, run, runBinary } from "./exec.js";

const BUTTON_CODE: Record<MouseButton, string> = { left: "1", middle: "2", right: "3" };

/**
 * X11 backend driven by `xdotool` (input) and ImageMagick `import` or `scrot`
 * (capture). Requires a reachable X display.
 */
export class LinuxBackend implements ComputerBackend {
  readonly name = "linux-x11";
  readonly platform = "linux";

  async isAvailable(): Promise<{ ok: boolean; detail: string }> {
    if (!process.env.DISPLAY) {
      return { ok: false, detail: "no DISPLAY environment variable set" };
    }
    if (!(await commandExists("xdotool"))) {
      return { ok: false, detail: "xdotool not found on PATH" };
    }
    const hasCapture = (await commandExists("import")) || (await commandExists("scrot"));
    if (!hasCapture) {
      return { ok: false, detail: "neither ImageMagick `import` nor `scrot` found" };
    }
    return { ok: true, detail: `display ${process.env.DISPLAY}` };
  }

  private async ensure(): Promise<void> {
    const status = await this.isAvailable();
    if (!status.ok) throw new BackendUnavailableError(this.name, status.detail);
  }

  async getScreenSize(): Promise<Size> {
    await this.ensure();
    const { stdout } = await run("xdotool", ["getdisplaygeometry"]);
    const [w, h] = stdout.trim().split(/\s+/).map(Number);
    return { width: w ?? 0, height: h ?? 0 };
  }

  async cursorPosition(): Promise<Point> {
    await this.ensure();
    const { stdout } = await run("xdotool", ["getmouselocation", "--shell"]);
    const x = /X=(\d+)/.exec(stdout)?.[1];
    const y = /Y=(\d+)/.exec(stdout)?.[1];
    return { x: Number(x ?? 0), y: Number(y ?? 0) };
  }

  async screenshot(req: ScreenshotRequest): Promise<ScreenshotResult> {
    await this.ensure();
    const screenSize = await this.getScreenSize();
    const region: Region = req.region ?? { x: 0, y: 0, ...screenSize };
    const zoom = req.zoom && req.zoom > 0 ? req.zoom : 1;
    if (req.delayMs) await sleep(req.delayMs);

    const captureStart = performance.now();
    let png: Buffer;
    if (await commandExists("import")) {
      const args = [
        "-window",
        "root",
        "-crop",
        `${region.width}x${region.height}+${region.x}+${region.y}`,
      ];
      if (zoom !== 1) args.push("-resize", `${Math.round(zoom * 100)}%`);
      args.push("png:-");
      png = await runBinary("import", args);
    } else {
      // scrot writes to a file; capture full screen then leave region cropping
      // to ImageMagick callers. We approximate by capturing the full screen.
      const tmp = `/tmp/cua-shot-${Date.now()}.png`;
      await run("scrot", ["-o", tmp]);
      png = await runBinary("cat", [tmp]);
    }
    const captureMs = performance.now() - captureStart;

    return finalizeScreenshot({
      png,
      region,
      screenSize,
      zoom,
      captureMs,
      monitorId: process.env.DISPLAY ?? "primary",
      budget:
        req.maxLongEdge && req.maxPixels
          ? { maxLongEdge: req.maxLongEdge, maxPixels: req.maxPixels }
          : undefined,
    });
  }

  async moveMouse(p: Point): Promise<void> {
    await this.ensure();
    await run("xdotool", ["mousemove", String(p.x), String(p.y)]);
  }

  async click(p: Point | undefined, button: MouseButton, count: number): Promise<void> {
    await this.ensure();
    if (p) await run("xdotool", ["mousemove", String(p.x), String(p.y)]);
    await run("xdotool", ["click", "--repeat", String(Math.max(1, count)), BUTTON_CODE[button]]);
  }

  async typeText(text: string): Promise<void> {
    await this.ensure();
    await run("xdotool", ["type", "--clearmodifiers", "--", text]);
  }

  async key(combo: string): Promise<void> {
    await this.ensure();
    await run("xdotool", ["key", "--clearmodifiers", combo]);
  }

  async scroll(p: Point | undefined, dx: number, dy: number): Promise<void> {
    await this.ensure();
    if (p) await run("xdotool", ["mousemove", String(p.x), String(p.y)]);
    const vButton = dy >= 0 ? "5" : "4";
    for (let i = 0; i < Math.abs(dy); i++) await run("xdotool", ["click", vButton]);
    const hButton = dx >= 0 ? "7" : "6";
    for (let i = 0; i < Math.abs(dx); i++) await run("xdotool", ["click", hButton]);
  }

  async drag(to: Point): Promise<void> {
    await this.ensure();
    await run("xdotool", ["mousedown", "1"]);
    try {
      await run("xdotool", ["mousemove", String(to.x), String(to.y)]);
    } finally {
      await run("xdotool", ["mouseup", "1"]);
    }
  }

  async windows(): Promise<WindowInfo[]> {
    await this.ensure();
    if (!(await commandExists("wmctrl"))) return [];
    const { stdout } = await run("wmctrl", ["-l"]);
    let active: string | undefined;
    try {
      active = (await run("xdotool", ["getactivewindow"])).stdout.trim();
    } catch {
      /* no active window */
    }
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, , ...rest] = line.split(/\s+/);
        const decId = id ? String(parseInt(id, 16)) : "";
        return {
          id: id ?? "",
          title: rest.slice(1).join(" "),
          focused: active !== undefined && decId === active,
        } satisfies WindowInfo;
      });
  }

  async activeWindow(): Promise<WindowInfo | null> {
    await this.ensure();
    try {
      const id = (await run("xdotool", ["getactivewindow"])).stdout.trim();
      const title = (await run("xdotool", ["getactivewindow", "getwindowname"])).stdout.trim();
      return { id, title, focused: true };
    } catch {
      return null;
    }
  }
}
