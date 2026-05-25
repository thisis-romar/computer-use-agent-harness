// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { describe, expect, it } from "vitest";

import {
  winClickScript,
  winDpiPreamble,
  winKeyScript,
  winKeyToVk,
  winScreenshotScript,
  winTypeScript,
  winVirtualScreenScript,
} from "./windows.js";

describe("winKeyToVk", () => {
  it("maps modifiers and the key to virtual-key codes", () => {
    expect(winKeyToVk("ctrl+c")).toEqual({ modifiers: [0x11], vk: 0x43 });
    expect(winKeyToVk("ctrl+shift+s")).toEqual({ modifiers: [0x11, 0x10], vk: 0x53 });
    expect(winKeyToVk("alt+F4")).toEqual({ modifiers: [0x12], vk: 0x73 });
    expect(winKeyToVk("enter")).toEqual({ modifiers: [], vk: 0x0d });
    expect(winKeyToVk("a")).toEqual({ modifiers: [], vk: 0x41 });
  });
});

describe("windows DPI awareness", () => {
  it("declares per-monitor-DPI-v2 awareness with a legacy fallback", () => {
    const p = winDpiPreamble();
    expect(p).toContain("SetProcessDpiAwarenessContext");
    expect(p).toContain("SetProcessDPIAware"); // fallback
    expect(p).toContain("-4"); // PER_MONITOR_AWARE_V2
  });

  it("prepends DPI awareness to coordinate/capture scripts", () => {
    expect(winScreenshotScript({ x: 0, y: 0, width: 10, height: 10 }, 10, 10, "C:/t.png")).toContain(
      "SetProcessDpiAwarenessContext",
    );
    expect(winClickScript({ x: 1, y: 2 }, "left", 1)).toContain("SetProcessDpiAwarenessContext");
  });
});

describe("windows multi-monitor capture", () => {
  it("measures the full virtual screen, not just the primary monitor", () => {
    expect(winVirtualScreenScript()).toContain("VirtualScreen");
  });

  it("captures from the requested origin", () => {
    const s = winScreenshotScript({ x: -1920, y: 0, width: 1920, height: 1080 }, 1920, 1080, "C:/t.png");
    expect(s).toContain("CopyFromScreen(-1920,0,0,0,$src.Size)");
  });
});

describe("windows SendInput keyboard", () => {
  it("types via Unicode SendInput per UTF-16 unit", () => {
    const s = winTypeScript("Hi");
    expect(s).toContain("SendInput"); // from the embedded C#
    expect(s).toContain("[CuaIn]::Unicode(72,$false)"); // 'H'
    expect(s).toContain("[CuaIn]::Unicode(105,$false)"); // 'i'
  });

  it("emits modifier-wrapped key-down/up for combos", () => {
    const s = winKeyScript("ctrl+c");
    expect(s).toContain("[CuaIn]::Key(17,$false)"); // ctrl down
    expect(s).toContain("[CuaIn]::Key(67,$false)"); // c down
    expect(s).toContain("[CuaIn]::Key(67,$true)"); // c up
    expect(s).toContain("[CuaIn]::Key(17,$true)"); // ctrl up (released last)
  });
});
