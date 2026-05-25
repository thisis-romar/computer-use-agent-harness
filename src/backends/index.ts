// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Emblem Projects. Dual-licensed; commercial license available.

import type { BackendSelector, HarnessConfig } from "../config.js";
import { logger } from "../logger.js";
import { AccessibilityBackend } from "./accessibility.js";
import type { ComputerBackend } from "./backend.js";
import { BrowserBackend } from "./browser.js";
import { DryRunBackend } from "./dryrun.js";
import { WindowsBackend } from "./windows.js";

export * from "./backend.js";

function nativeForPlatform(platform: NodeJS.Platform): ComputerBackend {
  if (platform === "win32") return new WindowsBackend();
  // Windows-first: no native backend on other platforms. The browser stub keeps
  // `auto` usable under dry-run (e.g. Linux CI) without driving a real OS.
  logger.warn("no native backend for this platform (Windows-only); using browser stub", {
    platform,
  });
  return new BrowserBackend();
}

function selectRaw(selector: BackendSelector): ComputerBackend {
  switch (selector) {
    case "windows":
      return new WindowsBackend();
    case "browser":
      return new BrowserBackend();
    case "accessibility":
      return new AccessibilityBackend();
    case "dry-run":
      return new DryRunBackend();
    case "auto":
    default:
      return nativeForPlatform(process.platform);
  }
}

/**
 * Resolve the active backend from config, applying the dry-run wrapper when
 * requested. When dry-run wraps a native backend, screenshots/geometry can
 * still be read from the OS while mutating actions stay simulated.
 */
export function createBackend(config: HarnessConfig): ComputerBackend {
  const raw = selectRaw(config.backend);
  if (config.dryRun && !(raw instanceof DryRunBackend)) {
    return new DryRunBackend(raw);
  }
  return raw;
}
