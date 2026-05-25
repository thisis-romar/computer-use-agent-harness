// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import { execFile } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Run an external command with an explicit argument array.
 *
 * Arguments are never passed through a shell, so values cannot be interpreted
 * as shell metacharacters. This is the only sanctioned way for a backend to
 * invoke native tooling.
 */
export function run(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; maxBuffer?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        timeout: opts.timeoutMs ?? 15_000,
        maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024,
        encoding: "buffer",
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr?.toString().trim() || error.message;
          reject(new Error(`${cmd} failed: ${detail}`));
          return;
        }
        resolve({ stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") });
      },
    );
  });
}

/** Run a command and return raw stdout bytes (for binary output like images). */
export function runBinary(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; maxBuffer?: number } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        timeout: opts.timeoutMs ?? 15_000,
        maxBuffer: opts.maxBuffer ?? 256 * 1024 * 1024,
        encoding: "buffer",
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr?.toString().trim() || error.message;
          reject(new Error(`${cmd} failed: ${detail}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/** Resolve whether a command is present on PATH. */
export async function commandExists(cmd: string): Promise<boolean> {
  const probe = process.platform === "win32" ? "where" : "which";
  try {
    await run(probe, [cmd], { timeoutMs: 4_000 });
    return true;
  } catch {
    return false;
  }
}
