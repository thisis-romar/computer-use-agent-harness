/**
 * Structured stderr logger.
 *
 * stdout is reserved for the MCP JSON-RPC stream when running over STDIO, so
 * all diagnostic logging must go to stderr to avoid corrupting the protocol.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.CUA_LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

const activeLevel = resolveLevel();

function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel]) {
    return;
  }
  const record = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(fields ?? {}),
  };
  process.stderr.write(`${JSON.stringify(record)}\n`);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
};
