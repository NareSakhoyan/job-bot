import { describe, expect, test } from "vitest";
import { parsePipelineLogLine } from "../pipeline-log";

describe("parsePipelineLogLine — reading the worker's own logs as progress", () => {
  test("reads a structured log line into a progress event", () => {
    const event = parsePipelineLogLine(
      '{"ts":"2026-08-18T15:40:15.230Z","level":"info","scope":"worker","message":"Matching started","jobs":1171}',
    );

    expect(event).toMatchObject({ level: "info", message: "Matching started" });
  });

  test("lifts done/total counters when a line carries them", () => {
    const event = parsePipelineLogLine(
      '{"ts":"2026-08-18T15:40:20.001Z","level":"info","scope":"worker","message":"Matching progress","done":400,"total":1171}',
    );

    expect(event).toMatchObject({ message: "Matching progress", done: 400, total: 1171 });
  });

  test("returns null for lines that are not structured logs", () => {
    expect(parsePipelineLogLine("> tsx src/index.ts match")).toBeNull();
    expect(parsePipelineLogLine("")).toBeNull();
    expect(parsePipelineLogLine("{ not json")).toBeNull();
    // JSON, but not one of our log lines.
    expect(parsePipelineLogLine('{"foo": 1}')).toBeNull();
  });

  test("keeps error lines identifiable so a run can surface its failure", () => {
    const event = parsePipelineLogLine(
      '{"ts":"2026-08-18T15:41:00.000Z","level":"error","scope":"worker.cli","message":"Worker failed","error":"boom"}',
    );

    expect(event).toMatchObject({ level: "error", message: "Worker failed", detail: "boom" });
  });

  test("ignores counters that are not finite numbers", () => {
    const event = parsePipelineLogLine(
      '{"ts":"x","level":"info","scope":"s","message":"m","done":"many","total":null}',
    );

    expect(event?.done).toBeUndefined();
    expect(event?.total).toBeUndefined();
  });
});
