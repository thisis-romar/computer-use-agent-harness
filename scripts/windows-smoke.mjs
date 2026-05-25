#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

// Windows backend validation harness. Run on a real Windows desktop session
// after `npm run build`:
//
//   node scripts/windows-smoke.mjs            # safe read-only checks + screenshots
//   CUA_SMOKE_INPUT=1 node scripts/windows-smoke.mjs   # also exercise input
//
// Read-only checks (geometry + capture) run by default. Input actions
// (move/click/scroll/type/key/drag) only run when CUA_SMOKE_INPUT=1 — focus a
// scratch Notepad first, because they drive the real desktop.

import { writeFileSync } from "node:fs";

import { WindowsBackend } from "../dist/backends/windows.js";

let pass = 0;
let fail = 0;
async function step(name, fn) {
  try {
    const detail = await fn();
    pass++;
    console.log(`PASS ${name}${detail ? " :: " + detail : ""}`);
  } catch (err) {
    fail++;
    console.log(`FAIL ${name} :: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  const b = new WindowsBackend();
  const avail = await b.isAvailable();
  console.log(`backend: ${b.name} (${b.platform}) — ${avail.detail}`);
  if (!avail.ok) {
    console.log("Not on Windows (or backend unavailable); nothing to validate here. Run on a Windows desktop.");
    return;
  }

  await step("getScreenSize", async () => JSON.stringify(await b.getScreenSize()));
  await step("cursorPosition", async () => JSON.stringify(await b.cursorPosition()));

  await step("screenshot(full)", async () => {
    const s = await b.screenshot({});
    writeFileSync("full.png", Buffer.from(s.base64, "base64"));
    return `full.png ${s.pixelSize.width}x${s.pixelSize.height} scaleX=${s.scaleX} scaleY=${s.scaleY} monitor=${s.monitorId} bytes=${s.byteSize}`;
  });

  await step("screenshot(region,zoom=2)", async () => {
    const s = await b.screenshot({ region: { x: 0, y: 0, width: 400, height: 300 }, zoom: 2 });
    writeFileSync("region.png", Buffer.from(s.base64, "base64"));
    return `region.png ${s.pixelSize.width}x${s.pixelSize.height} downscaled=${s.downscaled}`;
  });

  await step("windows()", async () => `${(await b.windows()).length} windows`);
  await step("activeWindow()", async () => JSON.stringify(await b.activeWindow()));

  if (process.env.CUA_SMOKE_INPUT === "1") {
    console.log("\n-- INPUT ACTIONS (focus a scratch Notepad now) --");
    await step("moveMouse", async () => {
      await b.moveMouse({ x: 300, y: 300 });
      return "moved to 300,300";
    });
    await step("click", async () => {
      await b.click({ x: 300, y: 300 }, "left", 1);
      return "left click";
    });
    await step("typeText(unicode)", async () => {
      await b.typeText("héllo 123 — Ünicode ✓");
      return "typed";
    });
    await step("key(ctrl+a)", async () => {
      await b.key("ctrl+a");
      return "select all";
    });
    await step("scroll", async () => {
      await b.scroll(undefined, 0, 3);
      return "scrolled down 3";
    });
    await step("drag", async () => {
      await b.drag({ x: 400, y: 400 });
      return "dragged to 400,400";
    });
  } else {
    console.log("\n(input actions skipped; set CUA_SMOKE_INPUT=1 to exercise them)");
  }

  console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : "FAILURES: " + fail} (${pass} passed)`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
