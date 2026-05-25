import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { commandExists, runBinary } from "../backends/exec.js";
import type { ScreenshotResult } from "../backends/backend.js";
import type { Region, Size } from "../types.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export interface ImageBudget {
  maxLongEdge: number;
  maxPixels: number;
}

/**
 * Best-effort downscale of a PNG to satisfy the budget, using ImageMagick
 * `convert` when present. Returns the original buffer unchanged (and
 * `downscaled: false`) when no resizer is available.
 */
async function downscaleToBudget(
  png: Buffer,
  budget: ImageBudget,
): Promise<{ png: Buffer; downscaled: boolean }> {
  const native = readPngSize(png);
  const longEdge = Math.max(native.width, native.height);
  const pixels = native.width * native.height;
  if (longEdge <= budget.maxLongEdge && pixels <= budget.maxPixels) {
    return { png, downscaled: false };
  }
  if (!(await commandExists("convert"))) {
    return { png, downscaled: false };
  }
  const factor = Math.min(budget.maxLongEdge / longEdge, Math.sqrt(budget.maxPixels / pixels), 1);
  const targetW = Math.max(1, Math.floor(native.width * factor));
  const dir = await mkdtemp(join(tmpdir(), "cua-resize-"));
  const src = join(dir, "in.png");
  try {
    await writeFile(src, png);
    const out = await runBinary("convert", [src, "-resize", `${targetW}`, "png:-"]);
    return { png: out, downscaled: true };
  } catch {
    return { png, downscaled: false };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export interface FinalizeInput {
  png: Buffer;
  region: Region;
  screenSize: Size;
  zoom: number;
  captureMs: number;
  monitorId?: string;
  budget?: ImageBudget;
}

/**
 * Build a fully-populated, stable ScreenshotResult from a raw PNG. Centralizes
 * budget downscaling, metadata, and hashing so every backend reports the same
 * contract.
 */
export async function finalizeScreenshot(input: FinalizeInput): Promise<ScreenshotResult> {
  const encodeStart = performance.now();
  let png = input.png;
  let downscaled = false;
  if (input.budget) {
    const result = await downscaleToBudget(png, input.budget);
    png = result.png;
    downscaled = result.downscaled;
  }
  const pixelSize = readPngSize(png);
  const longEdge = Math.max(pixelSize.width, pixelSize.height);
  const withinBudget = !input.budget
    ? true
    : longEdge <= input.budget.maxLongEdge && pixelSize.width * pixelSize.height <= input.budget.maxPixels;
  const scaleX = input.region.width > 0 ? pixelSize.width / input.region.width : input.zoom;
  const scaleY = input.region.height > 0 ? pixelSize.height / input.region.height : input.zoom;
  return {
    base64: png.toString("base64"),
    mimeType: "image/png",
    region: input.region,
    screenSize: input.screenSize,
    pixelSize,
    scale: scaleX,
    scaleX,
    scaleY,
    zoom: input.zoom,
    cropOrigin: { x: input.region.x, y: input.region.y },
    monitorId: input.monitorId ?? "primary",
    captureMs: Math.round(input.captureMs),
    encodeMs: Math.round(performance.now() - encodeStart),
    byteSize: png.length,
    imageHash: createHash("sha256").update(png).digest("hex").slice(0, 16),
    withinBudget,
    downscaled,
    capturedAt: new Date().toISOString(),
  };
}


/**
 * Read pixel dimensions directly from a PNG's IHDR chunk.
 *
 * Avoids pulling in an image-decoding dependency just to populate screenshot
 * metadata; the IHDR width/height live at a fixed offset right after the
 * 8-byte signature and 4-byte length + 4-byte "IHDR" type.
 */
export function readPngSize(buf: Buffer): Size {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("not a valid PNG buffer");
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

/** Produce a tiny but valid 1x1 PNG used by the dry-run backend. */
export function syntheticPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
}
