import { readPngSize } from "../capture/screenshot.js";
import type { MouseButton, Point, Region, Size } from "../types.js";
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
}
