/**
 * Minimal structured logger. Every agent action gets logged through this so
 * that agent behaviour is observable from the start (engineering rules 6 & 7).
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;

const configuredLevel = (): LogLevel => {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  return raw && raw in LEVELS ? (raw as LogLevel) : "info";
};

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

const write = (
  level: LogLevel,
  scope: string,
  bindings: Record<string, unknown>,
  message: string,
  context?: Record<string, unknown>,
): void => {
  if (LEVELS[level] < LEVELS[configuredLevel()]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...bindings,
    ...context,
  };

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export const createLogger = (
  scope: string,
  bindings: Record<string, unknown> = {},
): Logger => ({
  debug: (message, context) => write("debug", scope, bindings, message, context),
  info: (message, context) => write("info", scope, bindings, message, context),
  warn: (message, context) => write("warn", scope, bindings, message, context),
  error: (message, context) => write("error", scope, bindings, message, context),
  child: (extra) => createLogger(scope, { ...bindings, ...extra }),
});
