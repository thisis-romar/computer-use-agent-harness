// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { describe, expect, it } from "vitest";

import {
  LINUX_BUTTON_CODE,
  linuxClickCmds,
  linuxDragCmds,
  linuxKeyCmds,
  linuxMoveCmds,
  linuxScrollCmds,
  linuxTypeCmds,
} from "./linux.js";
import { macClickArgs, macDragArgs, macKeyArgs, macMoveArgs, macTypeArgs } from "./macos.js";
import { winKeyToSendKeys, winSendKeysEscape } from "./windows.js";

describe("linux xdotool command builders", () => {
  it("moves and types", () => {
    expect(linuxMoveCmds({ x: 10, y: 20 })).toEqual([{ cmd: "xdotool", args: ["mousemove", "10", "20"] }]);
    expect(linuxTypeCmds("hi")).toEqual([{ cmd: "xdotool", args: ["type", "--clearmodifiers", "--", "hi"] }]);
    expect(linuxKeyCmds("ctrl+c")).toEqual([{ cmd: "xdotool", args: ["key", "--clearmodifiers", "ctrl+c"] }]);
  });

  it("clicks with optional move, button code, and repeat count", () => {
    expect(LINUX_BUTTON_CODE).toEqual({ left: "1", middle: "2", right: "3" });
    expect(linuxClickCmds(undefined, "left", 1)).toEqual([
      { cmd: "xdotool", args: ["click", "--repeat", "1", "1"] },
    ]);
    expect(linuxClickCmds({ x: 5, y: 6 }, "right", 1)).toEqual([
      { cmd: "xdotool", args: ["mousemove", "5", "6"] },
      { cmd: "xdotool", args: ["click", "--repeat", "1", "3"] },
    ]);
    // double-click and a zero count clamped to 1
    expect(linuxClickCmds(undefined, "left", 2)[0]!.args).toEqual(["click", "--repeat", "2", "1"]);
    expect(linuxClickCmds(undefined, "middle", 0)[0]!.args).toEqual(["click", "--repeat", "1", "2"]);
  });

  it("maps scroll direction to wheel buttons", () => {
    expect(linuxScrollCmds(undefined, 0, 2)).toEqual([
      { cmd: "xdotool", args: ["click", "5"] },
      { cmd: "xdotool", args: ["click", "5"] },
    ]);
    expect(linuxScrollCmds(undefined, 0, -1)).toEqual([{ cmd: "xdotool", args: ["click", "4"] }]);
    expect(linuxScrollCmds(undefined, 1, 0)).toEqual([{ cmd: "xdotool", args: ["click", "7"] }]);
    expect(linuxScrollCmds(undefined, -1, 0)).toEqual([{ cmd: "xdotool", args: ["click", "6"] }]);
    expect(linuxScrollCmds({ x: 1, y: 1 }, 0, 1)[0]).toEqual({ cmd: "xdotool", args: ["mousemove", "1", "1"] });
  });

  it("drags down→move→up", () => {
    expect(linuxDragCmds({ x: 9, y: 8 })).toEqual([
      { cmd: "xdotool", args: ["mousedown", "1"] },
      { cmd: "xdotool", args: ["mousemove", "9", "8"] },
      { cmd: "xdotool", args: ["mouseup", "1"] },
    ]);
  });
});

describe("macos cliclick arg builders", () => {
  it("moves, types, and drags", () => {
    expect(macMoveArgs({ x: 3, y: 4 })).toEqual(["m:3,4"]);
    expect(macTypeArgs("hi")).toEqual(["t:hi"]);
    expect(macDragArgs({ x: 0, y: 0 }, { x: 5, y: 6 })).toEqual(["dd:0,0", "du:5,6"]);
  });

  it("selects the right click verb", () => {
    expect(macClickArgs(undefined, "left", 1)).toEqual(["c:."]);
    expect(macClickArgs({ x: 1, y: 2 }, "right", 1)).toEqual(["rc:1,2"]);
    expect(macClickArgs({ x: 1, y: 2 }, "left", 2)).toEqual(["dc:1,2"]);
  });

  it("splits key modifiers from the key", () => {
    expect(macKeyArgs("cmd+c")).toEqual(["kd:cmd", "t:c", "ku:cmd"]);
    expect(macKeyArgs("ctrl+alt+t")).toEqual(["kd:ctrl,alt", "t:t", "ku:ctrl,alt"]);
    expect(macKeyArgs("enter")).toEqual(["kp:enter"]);
  });
});

describe("windows SendKeys builders", () => {
  it("escapes SendKeys special characters and quotes", () => {
    expect(winSendKeysEscape("a+b(c)")).toBe("a{+}b{(}c{)}");
    expect(winSendKeysEscape("100%")).toBe("100{%}");
    expect(winSendKeysEscape("don't")).toBe("don''t");
    expect(winSendKeysEscape("plain")).toBe("plain");
  });

  it("translates key combos to SendKeys notation", () => {
    expect(winKeyToSendKeys("ctrl+c")).toBe("^c");
    expect(winKeyToSendKeys("ctrl+shift+s")).toBe("^+s");
    expect(winKeyToSendKeys("alt+F4")).toBe("%{F4}");
    expect(winKeyToSendKeys("enter")).toBe("{ENTER}");
    expect(winKeyToSendKeys("a")).toBe("a");
  });
});
