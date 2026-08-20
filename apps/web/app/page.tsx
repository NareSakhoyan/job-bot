import Link from "next/link";
import { listApplications, listJobs, listPipelineRuns, reconcileStalePipelineRuns } from "@job-bot/database";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { getActiveProfile, withProfile, type SearchParams } from "@/lib/active-profile";
import { APPLICATION_PIPELINE } from "@job-bot/shared";
import { Card } from "@/components/ui";
import { PipelinePanel } from "@/components/pipeline-panel";
import { isProcessAlive } from "@/lib/pipeline-runner";
import { canRunPipeline } from "@/lib/pipeline-capability";
import { humanizeEnum } from "@/lib/format";

export const dynamic = "force-dynamic";

const Stat = ({ label, value, href }: { label: string; value: string | number; href?: string }) => {
  const body = (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );

  return href ? (
    <Link href={href} className="block transition hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
};

const OverviewPage = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const { profiles, active } = await getActiveProfile(await searchParams);
  // Orphaned RUNNING rows would block the start button forever; reconcile on
  // every render of the page that shows them.
  await reconcileStalePipelineRuns(isProcessAlive);
  const [jobs, applications, runs] = await Promise.all([
    listJobs({ profileId: active.id }),
    listApplications(active.id),
    listPipelineRuns(),
  ]);

  const analysed = jobs.filter((job) => job.match !== null);
  const duplicateSightings = jobs.reduce(
    (total, job) => total + Math.max(0, job.sightings.length - 1),
    0,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          {active.fullName} · {active.headline}
        </p>
      </div>

      <ProfileSwitcher profiles={profiles} activeSlug={active.slug} basePath="/" />

      {canRunPipeline ? (
        <PipelinePanel runs={runs} profiles={profiles} />
      ) : (
        <Card title="Pipeline">
          <p className="text-sm text-[var(--color-ink-muted)]">
            This deployment is a read-only demo. Discovery, matching, and preparation spawn
            worker processes on the machine running the dashboard, so they are started from a
            local checkout — see the README for the commands.
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Distinct jobs" value={jobs.length} href={withProfile("/jobs", active.slug)} />
        <Stat label="Duplicates collapsed" value={duplicateSightings} />
        <Stat label="Analysed" value={analysed.length} />
        <Stat label="In pipeline" value={applications.length} href={withProfile("/applications", active.slug)} />
      </div>

      <Card title="Pipeline">
        <div className="flex flex-wrap gap-2">
          {APPLICATION_PIPELINE.map((status) => {
            const count = applications.filter((application) => application.status === status).length;
            return (
              <div
                key={status}
                className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-raised)] px-3 py-2"
              >
                <p className="text-xs text-[var(--color-ink-muted)]">{humanizeEnum(status)}</p>
                <p className="text-lg font-semibold tabular-nums">{count}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Current scope">
        <ul className="space-y-2 text-sm text-[var(--color-ink-muted)]">
          <li>Jobs come from the local mock source only — no external sites are contacted.</li>
          <li>
            Scores are computed by deterministic factor scoring; an LLM adds reasoning when one
            is configured, and can never change the score.
          </li>
          <li>Nothing can be submitted without an explicit human approval action.</li>
        </ul>
      </Card>
    </div>
  );
};

export default OverviewPage;
