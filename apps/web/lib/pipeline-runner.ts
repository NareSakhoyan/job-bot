import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  attachPipelineRunProcess,
  finishPipelineRun,
  notePipelineRunProgress,
  reconcileStalePipelineRuns,
  startPipelineRun,
} from "@job-bot/database";
import type { PipelineRunKind } from "@job-bot/database";
import { createLogger, parsePipelineLogLine, resolveRepoRoot } from "@job-bot/shared";

const logger = createLogger("web.pipeline");

/**
 * Runs a worker stage as a child of the dashboard process.
 *
 * The dashboard does not reimplement discover/match/prepare — it runs the same
 * CLI a person would, and reads the same log lines the terminal would show.
 * That keeps one implementation of each stage, and it means a run started from
 * the browser is reproducible by hand: the exact argv is on the run row.
 *
 * State lives in the database, not in this module. The web process only holds
 * the pipe; if it dies, the child dies with it and `reconcileStalePipelineRuns`
 * fails the orphaned row on the next page load. Nothing here survives a
 * restart, and nothing here needs to.
 */
const WORKER_COMMANDS: Record<PipelineRunKind, string[]> = {
  DISCOVER: ["discover"],
  MATCH: ["match"],
  PREPARE: ["prepare"],
  SUBMIT: ["submit"],
};

/** Messages that matter enough to overwrite the run's current note. */
const NOISE = new Set(["LLM provider ready", "LLM provider disabled by configuration"]);

export const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const launchPipelineRun = async (params: {
  kind: PipelineRunKind;
  extraArgs: string[];
  startedBy: string;
}): Promise<string> => {
  // A stale row would otherwise block the serialised start forever.
  await reconcileStalePipelineRuns(isProcessAlive);

  const argv = [...WORKER_COMMANDS[params.kind], ...params.extraArgs];
  const run = await startPipelineRun({ kind: params.kind, args: argv, startedBy: params.startedBy });

  const repoRoot = resolveRepoRoot();
  const logDir = join(repoRoot, "apps/worker/artifacts/pipeline-runs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `${run.id}.log`);

  const child = spawn("pnpm", ["--filter", "@job-bot/worker", "start", ...argv], {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  await attachPipelineRunProcess(run.id, child.pid ?? -1, logPath);
  logger.info("Pipeline run started", { runId: run.id, kind: params.kind, argv, pid: child.pid });

  const logFile = createWriteStream(logPath, { flags: "a" });
  let lastError: string | null = null;
  let buffer = "";

  const consume = (chunk: Buffer) => {
    logFile.write(chunk);
    buffer += chunk.toString("utf8");

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parsePipelineLogLine(line);
      if (!event) continue;

      if (event.level === "error") lastError = event.detail ?? event.message;
      if (NOISE.has(event.message)) continue;

      // Fire-and-forget on purpose: progress is advisory, and a slow write
      // must never backpressure the worker's stdout pipe.
      void notePipelineRunProgress(run.id, {
        note: event.message,
        ...(event.done !== undefined ? { done: event.done } : {}),
        ...(event.total !== undefined ? { total: event.total } : {}),
      }).catch(() => {});
    }
  };

  child.stdout.on("data", consume);
  child.stderr.on("data", consume);

  child.on("close", (code) => {
    logFile.end();
    const error =
      code === 0 ? null : (lastError ?? `The worker exited with code ${code ?? "unknown"}.`);
    void finishPipelineRun(run.id, error)
      .then(() => logger.info("Pipeline run finished", { runId: run.id, code }))
      .catch((cause: unknown) =>
        logger.error("Pipeline run result could not be recorded", {
          runId: run.id,
          error: cause instanceof Error ? cause.message : String(cause),
        }),
      );
  });

  return run.id;
};
