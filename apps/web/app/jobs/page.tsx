import type { ApplicationStatus, JobSort } from "@job-bot/database";
import { getJobFilterOptions, listJobs } from "@job-bot/database";
import { APPLICATION_STATUSES } from "@job-bot/shared";
import { JobFilters } from "@/components/job-filters";
import { JobTable } from "@/components/job-table";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { Card } from "@/components/ui";
import { getActiveProfile, singleParam, type SearchParams } from "@/lib/active-profile";

export const dynamic = "force-dynamic";

const SORTS: readonly JobSort[] = ["score", "recent", "salary"];

const parseScore = (value: string): number | null => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
};

const parseSort = (value: string): JobSort =>
  (SORTS as readonly string[]).includes(value) ? (value as JobSort) : "score";

const parseStatus = (value: string): ApplicationStatus | null =>
  (APPLICATION_STATUSES as readonly string[]).includes(value) ? (value as ApplicationStatus) : null;

const JobsPage = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const params = await searchParams;
  const { profiles, active } = await getActiveProfile(params);

  const values = {
    reachableOnly: singleParam(params.reachableOnly),
    minScore: singleParam(params.minScore),
    role: singleParam(params.role),
    company: singleParam(params.company),
    location: singleParam(params.location),
    status: singleParam(params.status),
    sort: singleParam(params.sort) || "score",
  };

  const [jobs, options] = await Promise.all([
    listJobs({
      profileId: active.id,
      reachableOnly: values.reachableOnly === "1",
      minScore: parseScore(values.minScore),
      role: values.role || null,
      company: values.company || null,
      location: values.location || null,
      status: parseStatus(values.status),
      sort: parseSort(values.sort),
    }),
    getJobFilterOptions(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">{jobs.length} shown</p>
      </div>

      <ProfileSwitcher profiles={profiles} activeSlug={active.slug} basePath="/jobs" />

      <Card title="Filters">
        <JobFilters
          values={values}
          companies={options.companies}
          locations={options.locations}
          profileSlug={active.slug}
        />
      </Card>

      <Card>
        <JobTable jobs={jobs} profileSlug={active.slug} />
      </Card>
    </div>
  );
};

export default JobsPage;
