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

// Virtual-key codes for modifiers and named keys (single chars derive from the
// uppercased char code; f-keys from 0x70).
const VK_MODIFIERS: Record<string, number> = {
  ctrl: 0x11,
  control: 0x11,
  alt: 0x12,
  shift: 0x10,
  win: 0x5b,
  super: 0x5b,
  cmd: 0x5b,
  meta: 0x5b,
};
const VK_NAMED: Record<string, number> = {
  enter: 0x0d,
  return: 0x0d,
  tab: 0x09,
  esc: 0x1b,
  escape: 0x1b,
  space: 0x20,
  backspace: 0x08,
  back: 0x08,
  delete: 0x2e,
  del: 0x2e,
  insert: 0x2d,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  capslock: 0x14,
  printscreen: 0x2c,
};

// ---------------------------------------------------------------------------
// Pure builders (exported for unit testing the generated PowerShell without a
// Windows host). Methods below delegate to these.
// ---------------------------------------------------------------------------

/**
 * Declare per-monitor-DPI-v2 awareness so coordinates and screen capture are in
 * true physical pixels regardless of display scaling. Falls back to the legacy
 * system-DPI-aware call on older Windows. Prepended to coordinate/capture scripts.
 */
export function winDpiPreamble(): string {
  return (
    "Add-Type -MemberDefinition '" +
    '[DllImport("user32.dll")]public static extern bool SetProcessDpiAwarenessContext(System.IntPtr value);' +
    '[DllImport("user32.dll")]public static extern bool SetProcessDPIAware();' +
    "' -Name Dpi -Namespace Cua -ErrorAction SilentlyContinue; " +
    "try { [void][Cua.Dpi]::SetProcessDpiAwarenessContext([System.IntPtr](-4)) } " +
    "catch { try { [void][Cua.Dpi]::SetProcessDPIAware() } catch {} }; "
  );
}

/** Outputs "X,Y,Width,Height" of the bounding rectangle across all monitors. */
export function winVirtualScreenScript(): string {
  return (
    winDpiPreamble() +
    "Add-Type -AssemblyName System.Windows.Forms; " +
    "$v=[System.Windows.Forms.SystemInformation]::VirtualScreen; " +
    'Write-Output "$($v.X),$($v.Y),$($v.Width),$($v.Height)"'
  );
}

export function winScreenshotScript(region: Region, w: number, h: number, outPath: string): string {
  return [
    winDpiPreamble(),
    "Add-Type -AssemblyName System.Drawing;",
    `$src=New-Object System.Drawing.Bitmap(${region.width},${region.height});`,
    "$g=[System.Drawing.Graphics]::FromImage($src);",
    `$g.CopyFromScreen(${region.x},${region.y},0,0,$src.Size);`,
    `$dst=New-Object System.Drawing.Bitmap($src,${w},${h});`,
    `$dst.Save('${outPath.replace(/\\/g, "\\\\")}',[System.Drawing.Imaging.ImageFormat]::Png);`,
    "$g.Dispose();$src.Dispose();$dst.Dispose();",
  ].join(" ");
}

export function winMoveScript(p: Point): string {
  return (
    winDpiPreamble() +
    "Add-Type -MemberDefinition '[DllImport(\"user32.dll\")]public static extern bool SetCursorPos(int x,int y);'" +
    ` -Name Mv -Namespace Cua; [void][Cua.Mv]::SetCursorPos(${p.x},${p.y})`
  );
}

const MOUSE_EVENT_DECL =
  "Add-Type -MemberDefinition '" +
  '[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,int e);' +
  '[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);' +
  "' -Name Me -Namespace Cua; ";

export function winClickScript(p: Point | undefined, button: MouseButton, count: number): string {
  const flags = MOUSE_FLAGS[button];
  const move = p ? `[void][Cua.Me]::SetCursorPos(${p.x},${p.y});` : "";
  const once = `[Cua.Me]::mouse_event(${flags.down},0,0,0,0);[Cua.Me]::mouse_event(${flags.up},0,0,0,0);`;
  return winDpiPreamble() + MOUSE_EVENT_DECL + move + once.repeat(Math.max(1, count));
}

export function winScrollScript(p: Point | undefined, dy: number): string {
  const move = p ? `[void][Cua.Me]::SetCursorPos(${p.x},${p.y});` : "";
  const delta = -dy * 120; // WHEEL_DELTA per step; positive dy scrolls down
  return winDpiPreamble() + MOUSE_EVENT_DECL + move + `[Cua.Me]::mouse_event(0x0800,0,0,${delta},0);`;
}

export function winDragScript(to: Point): string {
  return (
    winDpiPreamble() +
    MOUSE_EVENT_DECL +
    `[Cua.Me]::mouse_event(0x0002,0,0,0,0);[void][Cua.Me]::SetCursorPos(${to.x},${to.y});[Cua.Me]::mouse_event(0x0004,0,0,0,0);`
  );
}

// Canonical SendInput P/Invoke (keyboard). Single-line C# so it survives as one
// PowerShell -Command argument. KEYEVENTF: KEYUP=0x2, UNICODE=0x4.
const SENDINPUT_CSHARP =
  "using System;using System.Runtime.InteropServices;" +
  "public static class CuaIn{" +
  "[StructLayout(LayoutKind.Sequential)]struct MOUSEINPUT{public int dx;public int dy;public uint mouseData;public uint dwFlags;public uint time;public IntPtr dwExtraInfo;}" +
  "[StructLayout(LayoutKind.Sequential)]struct KEYBDINPUT{public ushort wVk;public ushort wScan;public uint dwFlags;public uint time;public IntPtr dwExtraInfo;}" +
  "[StructLayout(LayoutKind.Sequential)]struct HARDWAREINPUT{public uint uMsg;public ushort wParamL;public ushort wParamH;}" +
  "[StructLayout(LayoutKind.Explicit)]struct InputUnion{[FieldOffset(0)]public MOUSEINPUT mi;[FieldOffset(0)]public KEYBDINPUT ki;[FieldOffset(0)]public HARDWAREINPUT hi;}" +
  "[StructLayout(LayoutKind.Sequential)]struct INPUT{public uint type;public InputUnion U;}" +
  "[DllImport(\"user32.dll\",SetLastError=true)]static extern uint SendInput(uint n,INPUT[] inputs,int cb);" +
  "static INPUT Kbd(ushort vk,ushort scan,uint flags){INPUT i=new INPUT();i.type=1;i.U.ki.wVk=vk;i.U.ki.wScan=scan;i.U.ki.dwFlags=flags;return i;}" +
  "public static void Key(ushort vk,bool up){SendInput(1,new INPUT[]{Kbd(vk,0,up?2u:0u)},Marshal.SizeOf(typeof(INPUT)));}" +
  "public static void Unicode(ushort ch,bool up){SendInput(1,new INPUT[]{Kbd(0,ch,up?6u:4u)},Marshal.SizeOf(typeof(INPUT)));}" +
  "}";

function sendInputPreamble(): string {
  return `Add-Type -TypeDefinition '${SENDINPUT_CSHARP}'; `;
}

export function winTypeScript(text: string): string {
  let body = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i); // UTF-16 code unit
    body += `[CuaIn]::Unicode(${code},$false);[CuaIn]::Unicode(${code},$true);`;
  }
  return sendInputPreamble() + body;
}

/** Translate a combo like "ctrl+shift+s" into modifier VK codes + the key VK. */
export function winKeyToVk(combo: string): { modifiers: number[]; vk: number } {
  const parts = combo.split("+").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const keyName = parts.pop() ?? "";
  const modifiers = parts.map((m) => VK_MODIFIERS[m]).filter((v): v is number => v !== undefined);
  let vk = 0;
  const fMatch = /^f(\d{1,2})$/.exec(keyName);
  if (VK_NAMED[keyName] !== undefined) {
    vk = VK_NAMED[keyName];
  } else if (fMatch) {
    vk = 0x70 + (Number(fMatch[1]) - 1);
  } else if (keyName.length === 1) {
    vk = keyName.toUpperCase().charCodeAt(0);
  }
  return { modifiers, vk };
}

export function winKeyScript(combo: string): string {
  const { modifiers, vk } = winKeyToVk(combo);
  let body = "";
  for (const m of modifiers) body += `[CuaIn]::Key(${m},$false);`;
  if (vk) body += `[CuaIn]::Key(${vk},$false);[CuaIn]::Key(${vk},$true);`;
  for (const m of [...modifiers].reverse()) body += `[CuaIn]::Key(${m},$true);`;
  return sendInputPreamble() + body;
}

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

  /** Bounding rectangle across all monitors (origin may be negative). */
  private async virtualScreen(): Promise<Region> {
    const { stdout } = await this.ps(winVirtualScreenScript());
    const [x, y, w, h] = stdout.trim().split(",").map(Number);
    return { x: x ?? 0, y: y ?? 0, width: w ?? 0, height: h ?? 0 };
  }

  async getScreenSize(): Promise<Size> {
    await this.ensure();
    const v = await this.virtualScreen();
    return { width: v.width, height: v.height };
  }

  async cursorPosition(): Promise<Point> {
    await this.ensure();
    const { stdout } = await this.ps(
      winDpiPreamble() +
        "Add-Type -AssemblyName System.Windows.Forms; " +
        "$p=[System.Windows.Forms.Cursor]::Position; " +
        'Write-Output "$($p.X),$($p.Y)"',
    );
    const [x, y] = stdout.trim().split(",").map(Number);
    return { x: x ?? 0, y: y ?? 0 };
  }

  async screenshot(req: ScreenshotRequest): Promise<ScreenshotResult> {
    await this.ensure();
    const vs = await this.virtualScreen();
    const screenSize: Size = { width: vs.width, height: vs.height };
    const region: Region = req.region ?? vs;
    const zoom = req.zoom && req.zoom > 0 ? req.zoom : 1;
    if (req.delayMs) await sleep(req.delayMs);
    const out = join(tmpdir(), `cua-shot-${Date.now()}.png`);
    const w = Math.max(1, Math.round(region.width * zoom));
    const h = Math.max(1, Math.round(region.height * zoom));

    const captureStart = performance.now();
    await this.ps(winScreenshotScript(region, w, h, out));
    const png = await readFile(out);
    await unlink(out).catch(() => undefined);
    const captureMs = performance.now() - captureStart;

    return finalizeScreenshot({
      png,
      region,
      screenSize,
      zoom,
      captureMs,
      monitorId: "virtual",
      budget:
        req.maxLongEdge && req.maxPixels
          ? { maxLongEdge: req.maxLongEdge, maxPixels: req.maxPixels }
          : undefined,
    });
  }

  async moveMouse(p: Point): Promise<void> {
    await this.ensure();
    await this.ps(winMoveScript(p));
  }

  async click(p: Point | undefined, button: MouseButton, count: number): Promise<void> {
    await this.ensure();
    await this.ps(winClickScript(p, button, count));
  }

  async typeText(text: string): Promise<void> {
    await this.ensure();
    if (text.length === 0) return;
    await this.ps(winTypeScript(text));
  }

  async key(combo: string): Promise<void> {
    await this.ensure();
    await this.ps(winKeyScript(combo));
  }

  async scroll(p: Point | undefined, _dx: number, dy: number): Promise<void> {
    await this.ensure();
    await this.ps(winScrollScript(p, dy));
  }

  async drag(to: Point): Promise<void> {
    await this.ensure();
    await this.ps(winDragScript(to));
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
      "Add-Type -MemberDefinition '[DllImport(\"user32.dll\")]public static extern System.IntPtr GetForegroundWindow();[DllImport(\"user32.dll\")]public static extern int GetWindowText(System.IntPtr h,System.Text.StringBuilder s,int n);' -Name Fg -Namespace Cua; ";
    const { stdout } = await this.ps(
      `${decl}$h=[Cua.Fg]::GetForegroundWindow();$sb=New-Object System.Text.StringBuilder 512;[void][Cua.Fg]::GetWindowText($h,$sb,512);Write-Output "$($h.ToInt64())\`t$($sb.ToString())"`,
    );
    const [id, ...rest] = stdout.trim().split("\t");
    if (!id) return null;
    return { id, title: rest.join(" "), focused: true };
  }
}
