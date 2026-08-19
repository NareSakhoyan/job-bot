import type { PipelineRunKind } from "@prisma/client";
import { prisma } from "../client";

/**
 * Claims the right to run a pipeline stage.
 *
 * Batch stages are serialised with each other: discovery writes the jobs
 * table while matching reads it, and prepare spends model calls against rows
 * matching may be replacing. One at a time costs a little waiting and removes
 * a class of races outright.
 *
 * SUBMIT sits in its own lane. A handoff run stays alive for as long as the
 * person leaves the browser window open — sharing the batch lock would let an
 * unread form block discovery for an afternoon. It is safe to exempt because
 * a submit run touches only its own application row, and that row is guarded
 * by the claim system, not by this lock. Two submits at once are still
 * refused: each would open a window, and a person can only be in one.
 *
 * The check-then-create runs in a transaction so two dashboard clicks cannot
 * both pass the check.
 */
export const startPipelineRun = async (params: {
  kind: PipelineRunKind;
  args: string[];
  startedBy: string;
}) =>
  prisma.$transaction(async (tx) => {
    const submitting = params.kind === "SUBMIT";
    const running = await tx.pipelineRun.findFirst({
      where: { status: "RUNNING", kind: submitting ? "SUBMIT" : { not: "SUBMIT" } },
      select: { id: true, kind: true, startedAt: true },
    });

    if (running) {
      throw new Error(
        `A ${running.kind} run started at ${running.startedAt.toISOString()} is still going. One at a time.`,
      );
    }

    return tx.pipelineRun.create({
      data: { kind: params.kind, args: params.args, startedBy: params.startedBy },
    });
  });

export const attachPipelineRunProcess = async (runId: string, pid: number, logPath: string) =>
  prisma.pipelineRun.update({ where: { id: runId }, data: { pid, logPath } });

/** Progress writes are last-wins by design; the log file keeps the full story. */
export const notePipelineRunProgress = async (
  runId: string,
  progress: { note?: string; done?: number; total?: number },
) => prisma.pipelineRun.update({ where: { id: runId }, data: progress });

export const finishPipelineRun = async (runId: string, error: string | null) =>
  prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: error === null ? "SUCCEEDED" : "FAILED",
      error,
      finishedAt: new Date(),
    },
  });

/**
 * Marks RUNNING rows whose process no longer exists as failed.
 *
 * The runner lives inside the dashboard process; if that restarts, its
 * children die with it and the rows they were updating would stay RUNNING
 * forever — blocking every future run, since starting is serialised on them.
 * `isAlive` is injected because only the caller knows how to ask the OS.
 */
export const reconcileStalePipelineRuns = async (isAlive: (pid: number) => boolean) => {
  const running = await prisma.pipelineRun.findMany({
    where: { status: "RUNNING" },
    select: { id: true, pid: true, startedAt: true },
  });

  let reconciled = 0;
  for (const run of running) {
    // A row with no pid yet is younger than the spawn call; leave fresh ones
    // alone, fail ones old enough that the spawn evidently never completed.
    const stale =
      run.pid === null
        ? Date.now() - run.startedAt.getTime() > 60_000
        : !isAlive(run.pid);

    if (!stale) continue;
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: "The dashboard restarted while this run was in flight; its process is gone.",
        finishedAt: new Date(),
      },
    });
    reconciled += 1;
  }

  return reconciled;
};

export const listPipelineRuns = async (take = 8) =>
  prisma.pipelineRun.findMany({ orderBy: { startedAt: "desc" }, take });
