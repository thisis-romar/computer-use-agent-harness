// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { describe, expect, it } from "vitest";

import { readPngSize, syntheticPng } from "./screenshot.js";

describe("readPngSize", () => {
  it("reads dimensions from a valid PNG", () => {
    const size = readPngSize(syntheticPng());
    expect(size).toEqual({ width: 1, height: 1 });
  });

  it("rejects non-PNG buffers", () => {
    expect(() => readPngSize(Buffer.from("not a png"))).toThrow(/valid PNG/);
  });
});
