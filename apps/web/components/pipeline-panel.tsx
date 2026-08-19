import type { listPipelineRuns } from "@job-bot/database";

type PipelineRun = Awaited<ReturnType<typeof listPipelineRuns>>[number];
import { startDiscovery, startMatching, startPreparation } from "@/app/pipeline/actions";
import { Card, Chip } from "@/components/ui";
import { RunPoller } from "@/components/run-poller";

const field =
  "rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-sky-500/60";
const button =
  "rounded-md border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-ink-muted)] transition hover:border-sky-500/50 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40";

const when = (date: Date) => date.toISOString().slice(11, 19);

const StatusChip = ({ run }: { run: PipelineRun }) =>
  run.status === "RUNNING" ? (
    <Chip tone="warn">running</Chip>
  ) : run.status === "FAILED" ? (
    <Chip tone="warn">failed</Chip>
  ) : (
    <Chip>done</Chip>
  );

const Progress = ({ run }: { run: PipelineRun }) => {
  if (run.done === null || run.total === null || run.total === 0) return null;
  const percent = Math.min(100, Math.round((run.done / run.total) * 100));
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full overflow-hidden rounded bg-[var(--color-surface-raised)]">
        <div className="h-full bg-sky-500/70 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs tabular-nums text-[var(--color-ink-muted)]">
        {run.done} / {run.total}
      </p>
    </div>
  );
};

/**
 * Starts worker stages and shows what they are doing.
 *
 * Submission is deliberately absent. Everything here is repeatable — a second
 * discovery or rescore costs time, not consequences — which is what makes it
 * safe behind a button. Sending an application is neither, and stays a
 * command you type.
 */
export const PipelinePanel = ({
  runs,
  profiles,
}: {
  runs: PipelineRun[];
  profiles: Array<{ slug: string }>;
}) => {
  const active = runs.find((run) => run.status === "RUNNING") ?? null;
  const busy = active !== null;

  return (
    <Card title="Pipeline">
      {busy ? <RunPoller /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <form action={startDiscovery} className="space-y-2">
          <p className="text-sm font-medium">Discover</p>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Fetch every configured board and feed, dedupe, persist.
          </p>
          <button type="submit" className={button} disabled={busy}>
            Run discovery
          </button>
        </form>

        <form action={startMatching} className="space-y-2">
          <p className="text-sm font-medium">Match</p>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Score unscored jobs for every profile. Model reasoning follows the configured
            provider and threshold.
          </p>
          <label className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
            <input type="checkbox" name="rescoreAll" /> rescore everything
          </label>
          <div className="flex gap-2">
            <input name="maxCalls" placeholder="max model calls" className={`${field} w-36`} />
            <button type="submit" className={button} disabled={busy}>
              Run matching
            </button>
          </div>
        </form>

        <form action={startPreparation} className="space-y-2">
          <p className="text-sm font-medium">Prepare</p>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Draft and verify material for the strongest matches. Needs a working LLM provider.
          </p>
          <div className="flex flex-wrap gap-2">
            <select name="profile" className={field} defaultValue={profiles[0]?.slug}>
              {profiles.map((profile) => (
                <option key={profile.slug} value={profile.slug}>
                  {profile.slug}
                </option>
              ))}
            </select>
            <input name="min" placeholder="min 65" className={`${field} w-20`} />
            <input name="limit" placeholder="limit 3" className={`${field} w-20`} />
            <button type="submit" className={button} disabled={busy}>
              Run prepare
            </button>
          </div>
        </form>
      </div>

      {runs.length > 0 ? (
        <div className="mt-5 space-y-2 border-t border-[var(--color-line)] pt-4">
          {runs.map((run) => (
            <div key={run.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{run.kind.toLowerCase()}</span>
                <StatusChip run={run} />
                <span className="text-xs tabular-nums text-[var(--color-ink-muted)]">
                  {when(run.startedAt)}
                  {run.finishedAt ? `–${when(run.finishedAt)}` : ""}
                </span>
                <span className="text-xs text-[var(--color-ink-muted)]">
                  {run.status === "FAILED" ? (run.error ?? "failed") : (run.note ?? "")}
                </span>
              </div>
              {run.status === "RUNNING" ? <Progress run={run} /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
};
