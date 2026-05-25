// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { describe, expect, it } from "vitest";

import { loadConfig } from "../config.js";
import { AccessibilityBackend } from "./accessibility.js";
import { CapabilityNotImplementedError } from "./backend.js";
import { BrowserBackend } from "./browser.js";
import { DryRunBackend } from "./dryrun.js";
import { createBackend } from "./index.js";

const cfg = (o: Record<string, string>) => loadConfig(o as NodeJS.ProcessEnv);

describe("createBackend", () => {
  it("returns a standalone dry-run backend when selected", () => {
    const b = createBackend(cfg({ CUA_BACKEND: "dry-run" }));
    expect(b).toBeInstanceOf(DryRunBackend);
    expect(b.name).toBe("dry-run");
  });

  it("wraps a native backend in dry-run when CUA_DRY_RUN is set", () => {
    const b = createBackend(cfg({ CUA_BACKEND: "windows", CUA_DRY_RUN: "true" }));
    expect(b).toBeInstanceOf(DryRunBackend);
    expect(b.name).toBe("dry-run(windows)");
  });
});

describe("DryRunBackend", () => {
  const b = createBackend(cfg({ CUA_BACKEND: "dry-run" }));

  it("reports available and produces enriched screenshot metadata", async () => {
    expect((await b.isAvailable()).ok).toBe(true);
    const s = await b.screenshot({ zoom: 2 });
    expect(s.mimeType).toBe("image/png");
    expect(s.byteSize).toBeGreaterThan(0);
    expect(s.imageHash).toHaveLength(16);
    expect(s.zoom).toBe(2);
    expect(typeof s.scaleX).toBe("number");
    expect(typeof s.captureMs).toBe("number");
    expect(s.monitorId).toBeTruthy();
  });

  it("simulates drag and window introspection without throwing", async () => {
    await expect(b.drag({ x: 1, y: 2 })).resolves.toBeUndefined();
    expect((await b.windows()).length).toBeGreaterThan(0);
    expect(await b.activeWindow()).not.toBeNull();
  });
});

describe("boundary stubs", () => {
  for (const Backend of [BrowserBackend, AccessibilityBackend]) {
    it(`${Backend.name} reports unavailable and rejects capabilities`, async () => {
      const b = new Backend();
      expect((await b.isAvailable()).ok).toBe(false);
      await expect(b.screenshot({})).rejects.toBeInstanceOf(CapabilityNotImplementedError);
      await expect(b.typeText("x")).rejects.toBeInstanceOf(CapabilityNotImplementedError);
    });
  }
});
