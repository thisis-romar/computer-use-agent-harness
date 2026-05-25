// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { finalizeScreenshot, sleep } from "../capture/screenshot.js";
import type { MouseButton, Point, Region, Size, WindowInfo } from "../types.js";
import {
  type ComputerBackend,
  type ScreenshotRequest,
  type ScreenshotResult,
  BackendUnavailableError,
} from "./backend.js";
import { commandExists, run } from "./exec.js";

// Pure cliclick argument builders — exported for argv unit testing.

export function macMoveArgs(p: Point): string[] {
  return [`m:${p.x},${p.y}`];
}

export function macClickArgs(p: Point | undefined, button: MouseButton, count: number): string[] {
  const at = p ? `${p.x},${p.y}` : ".";
  const verb = button === "right" ? "rc" : count >= 2 ? "dc" : "c";
  return [`${verb}:${at}`];
}

export function macTypeArgs(text: string): string[] {
  return [`t:${text}`];
}

export function macKeyArgs(combo: string): string[] {
  const parts = combo.split("+").map((s) => s.trim().toLowerCase());
  const key = parts.pop() ?? "";
  const mods = parts.join(",");
  return mods ? [`kd:${mods}`, `t:${key}`, `ku:${mods}`] : [`kp:${key}`];
}

export function macDragArgs(from: Point, to: Point): string[] {
  return [`dd:${from.x},${from.y}`, `du:${to.x},${to.y}`];
}

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
    if (req.delayMs) await sleep(req.delayMs);
    const out = join(tmpdir(), `cua-shot-${Date.now()}.png`);

    const captureStart = performance.now();
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
    const captureMs = performance.now() - captureStart;

    return finalizeScreenshot({
      png,
      region,
      screenSize,
      zoom,
      captureMs,
      budget:
        req.maxLongEdge && req.maxPixels
          ? { maxLongEdge: req.maxLongEdge, maxPixels: req.maxPixels }
          : undefined,
    });
  }

  async moveMouse(p: Point): Promise<void> {
    await this.ensure();
    await run("cliclick", macMoveArgs(p));
  }

  async click(p: Point | undefined, button: MouseButton, count: number): Promise<void> {
    await this.ensure();
    await run("cliclick", macClickArgs(p, button, count));
  }

  async typeText(text: string): Promise<void> {
    await this.ensure();
    await run("cliclick", macTypeArgs(text));
  }

  async key(combo: string): Promise<void> {
    await this.ensure();
    await run("cliclick", macKeyArgs(combo));
  }

  async scroll(p: Point | undefined, _dx: number, dy: number): Promise<void> {
    await this.ensure();
    if (p) await run("cliclick", macMoveArgs(p));
    // cliclick lacks a scroll verb; approximate via key presses on a focused view.
    const key = dy >= 0 ? "arrow-down" : "arrow-up";
    for (let i = 0; i < Math.abs(dy); i++) await run("cliclick", [`kp:${key}`]);
  }

  async drag(to: Point): Promise<void> {
    await this.ensure();
    const from = await this.cursorPosition();
    await run("cliclick", macDragArgs(from, to));
  }

  async windows(): Promise<WindowInfo[]> {
    await this.ensure();
    const script =
      'tell application "System Events" to get name of every process whose background only is false';
    const { stdout } = await run("osascript", ["-e", script]);
    return stdout
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((app) => ({ id: app, title: app, app }) satisfies WindowInfo);
  }

  async activeWindow(): Promise<WindowInfo | null> {
    await this.ensure();
    const script =
      'tell application "System Events" to get name of first process whose frontmost is true';
    const { stdout } = await run("osascript", ["-e", script]);
    const app = stdout.trim();
    return app ? { id: app, title: app, app, focused: true } : null;
  }
}
