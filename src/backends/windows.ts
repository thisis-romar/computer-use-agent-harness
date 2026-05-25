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
import { run } from "./exec.js";

const PS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];

const MOUSE_FLAGS: Record<MouseButton, { down: number; up: number }> = {
  left: { down: 0x0002, up: 0x0004 },
  right: { down: 0x0008, up: 0x0010 },
  middle: { down: 0x0020, up: 0x0040 },
};

/** Windows backend driven entirely through PowerShell + Win32 P/Invoke. */
export class WindowsBackend implements ComputerBackend {
  readonly name = "windows";
  readonly platform = "win32";

  async isAvailable(): Promise<{ ok: boolean; detail: string }> {
    if (process.platform !== "win32") {
      return { ok: false, detail: `host platform is ${process.platform}, not win32` };
    }
    return { ok: true, detail: "powershell available" };
  }

  private async ensure(): Promise<void> {
    const status = await this.isAvailable();
    if (!status.ok) throw new BackendUnavailableError(this.name, status.detail);
  }

  private ps(script: string): Promise<{ stdout: string }> {
    return run("powershell", [...PS, script]);
  }

  async getScreenSize(): Promise<Size> {
    await this.ensure();
    const { stdout } = await this.ps(
      "Add-Type -AssemblyName System.Windows.Forms; " +
        "$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; " +
        'Write-Output "$($b.Width),$($b.Height)"',
    );
    const [w, h] = stdout.trim().split(",").map(Number);
    return { width: w ?? 0, height: h ?? 0 };
  }

  async cursorPosition(): Promise<Point> {
    await this.ensure();
    const { stdout } = await this.ps(
      "Add-Type -AssemblyName System.Windows.Forms; " +
        "$p=[System.Windows.Forms.Cursor]::Position; " +
        'Write-Output "$($p.X),$($p.Y)"',
    );
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
    const w = Math.max(1, Math.round(region.width * zoom));
    const h = Math.max(1, Math.round(region.height * zoom));

    const captureStart = performance.now();
    const script = [
      "Add-Type -AssemblyName System.Drawing;",
      `$src=New-Object System.Drawing.Bitmap(${region.width},${region.height});`,
      "$g=[System.Drawing.Graphics]::FromImage($src);",
      `$g.CopyFromScreen(${region.x},${region.y},0,0,$src.Size);`,
      `$dst=New-Object System.Drawing.Bitmap($src,${w},${h});`,
      `$dst.Save('${out.replace(/\\/g, "\\\\")}',[System.Drawing.Imaging.ImageFormat]::Png);`,
      "$g.Dispose();$src.Dispose();$dst.Dispose();",
    ].join(" ");
    await this.ps(script);

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
    await this.ps(
      "Add-Type -AssemblyName System.Windows.Forms; " +
        `[System.Windows.Forms.Cursor]::Position=New-Object System.Drawing.Point(${p.x},${p.y})`,
    );
  }

  async click(p: Point | undefined, button: MouseButton, count: number): Promise<void> {
    await this.ensure();
    if (p) await this.moveMouse(p);
    const flags = MOUSE_FLAGS[button];
    const decl =
      "Add-Type -MemberDefinition '[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint x,uint y,uint d,int e);' -Name U -Namespace W;";
    const clickOnce = `[W.U]::mouse_event(${flags.down},0,0,0,0);[W.U]::mouse_event(${flags.up},0,0,0,0);`;
    await this.ps(decl + clickOnce.repeat(Math.max(1, count)));
  }

  async typeText(text: string): Promise<void> {
    await this.ensure();
    const escaped = text.replace(/[+^%~(){}[\]]/g, "{$&}").replace(/'/g, "''");
    await this.ps(
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')`,
    );
  }

  async key(combo: string): Promise<void> {
    await this.ensure();
    const map: Record<string, string> = { ctrl: "^", control: "^", alt: "%", shift: "+" };
    const parts = combo.split("+").map((s) => s.trim().toLowerCase());
    const key = parts.pop() ?? "";
    const mods = parts.map((m) => map[m] ?? "").join("");
    const sendkey = key.length === 1 ? key : `{${key.toUpperCase()}}`;
    await this.ps(
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${mods}${sendkey}')`,
    );
  }

  async scroll(p: Point | undefined, _dx: number, dy: number): Promise<void> {
    await this.ensure();
    if (p) await this.moveMouse(p);
    const decl =
      "Add-Type -MemberDefinition '[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint x,uint y,uint d,int e);' -Name U -Namespace W;";
    const delta = -dy * 120;
    await this.ps(`${decl}[W.U]::mouse_event(0x0800,0,0,${delta},0)`);
  }

  async drag(to: Point): Promise<void> {
    await this.ensure();
    const decl =
      "Add-Type -MemberDefinition '[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint x,uint y,uint d,int e);[DllImport(\"user32.dll\")]public static extern bool SetCursorPos(int x,int y);' -Name U -Namespace W;";
    await this.ps(
      `${decl}[W.U]::mouse_event(0x0002,0,0,0,0);[W.U]::SetCursorPos(${to.x},${to.y});[W.U]::mouse_event(0x0004,0,0,0,0);`,
    );
  }

  async windows(): Promise<WindowInfo[]> {
    await this.ensure();
    const { stdout } = await this.ps(
      "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | " +
        "ForEach-Object { \"$($_.Id)`t$($_.MainWindowTitle)\" }",
    );
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, ...rest] = line.split("\t");
        return { id: id ?? "", title: rest.join(" ") } satisfies WindowInfo;
      });
  }

  async activeWindow(): Promise<WindowInfo | null> {
    await this.ensure();
    const decl =
      "Add-Type -MemberDefinition '[DllImport(\"user32.dll\")]public static extern System.IntPtr GetForegroundWindow();[DllImport(\"user32.dll\")]public static extern int GetWindowText(System.IntPtr h,System.Text.StringBuilder s,int n);' -Name FG -Namespace W;";
    const { stdout } = await this.ps(
      `${decl}$h=[W.FG]::GetForegroundWindow();$sb=New-Object System.Text.StringBuilder 512;[void][W.FG]::GetWindowText($h,$sb,512);Write-Output "$($h.ToInt64())\`t$($sb.ToString())"`,
    );
    const [id, ...rest] = stdout.trim().split("\t");
    if (!id) return null;
    return { id, title: rest.join(" "), focused: true };
  }
}
