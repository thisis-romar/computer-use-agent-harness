import type { Size } from "../types.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
