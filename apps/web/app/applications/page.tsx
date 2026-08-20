import { listApplications, listApplicationsAwaitingHuman } from "@job-bot/database";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { getActiveProfile, type SearchParams } from "@/lib/active-profile";
import { PipelineBoard } from "@/components/pipeline-board";
import { AwaitingHuman } from "@/components/awaiting-human";
import { Card, EmptyState } from "@/components/ui";
import { NeedsYou } from "@/components/needs-you";
import { canRunPipeline } from "@/lib/pipeline-capability";
import { ExternalApplication } from "@/components/external-application";

export const dynamic = "force-dynamic";

const ApplicationsPage = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const { profiles, active } = await getActiveProfile(await searchParams);
  const applications = await listApplications(active.id);
  const awaiting = await listApplicationsAwaitingHuman(active.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">{applications.length} tracked</p>
      </div>

      <ProfileSwitcher profiles={profiles} activeSlug={active.slug} basePath="/applications" />

      <NeedsYou applications={applications} canLaunchRuns={canRunPipeline} />

      <ExternalApplication profileId={active.id} />

      <AwaitingHuman applications={awaiting} />

      {applications.length === 0 ? (
        <EmptyState title="Pipeline is empty" hint="Run pnpm discover, then pnpm match for this profile." />
      ) : (
        <PipelineBoard applications={applications} profileSlug={active.slug} />
      )}

      <Card title="Approval gate">
        <p className="text-sm text-[var(--color-ink-muted)]">
          Nothing is ever sent without a person. Sending takes two recorded human actions —
          an approval on Review, then filling the form from this page — and the final click
          happens in the browser window, by you. The automatic clicker is not reachable from
          the dashboard.
        </p>
      </Card>
    </div>
  );
};

export default ApplicationsPage;
