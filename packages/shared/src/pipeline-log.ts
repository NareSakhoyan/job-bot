/**
 * Reads one line of worker output as a progress event.
 *
 * The worker already narrates itself: every meaningful step lands as one JSON
 * log line with a `message`. A pipeline run started from the dashboard streams
 * those same lines, so progress reporting is a matter of parsing what the
 * worker says rather than inventing a second progress channel that would
 * drift from the first.
 */
export interface PipelineLogEvent {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  /** Present when the line carries a done/total counter pair. */
  done?: number;
  total?: number;
  /** The error text on an error line, for surfacing a failed run's cause. */
  detail?: string;
}

const LEVELS = new Set(["debug", "info", "warn", "error"]);

export const parsePipelineLogLine = (line: string): PipelineLogEvent | null => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;

  if (typeof record.message !== "string" || typeof record.level !== "string") return null;
  if (!LEVELS.has(record.level)) return null;

  const event: PipelineLogEvent = {
    level: record.level as PipelineLogEvent["level"],
    message: record.message,
  };

  if (typeof record.done === "number" && Number.isFinite(record.done)) event.done = record.done;
  if (typeof record.total === "number" && Number.isFinite(record.total)) event.total = record.total;
  if (typeof record.error === "string") event.detail = record.error;

  return event;
};
