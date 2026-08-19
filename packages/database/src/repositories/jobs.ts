import { normalizeCompany, normalizeText } from "@job-bot/jobs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../client";

export type JobSort = "score" | "recent" | "salary";

export interface JobListFilters {
  /** Matches and applications are scoped to this profile. */
  profileId: string;
  /** Closed postings are hidden unless asked for explicitly. */
  includeClosed?: boolean;
  sort?: JobSort;
  minScore?: number | null;
  role?: string | null;
  company?: string | null;
  location?: string | null;
  status?: Prisma.EnumApplicationStatusFilter["equals"] | null;
  /**
   * Keep only postings the candidate could actually take.
   *
   * Applied after the query because eligibility lives inside the match's
   * factor JSON rather than in a column. That is the right place for it — the
   * scorer owns the judgement — but it means the filter cannot be pushed into
   * SQL without duplicating the rule in two languages.
   */
  reachableOnly?: boolean;
}

/** Below this, the eligibility gate has already capped the job's total score. */
export const REACHABLE_ELIGIBILITY = 75;

/**
 * `matches` and `applications` are filtered to the active profile, so a job
 * carries at most one of each in the result — the shape the UI expects.
 */
const buildInclude = (profileId: string) =>
  ({
    matches: { where: { profileId } },
    applications: {
      where: { profileId },
      select: { id: true, status: true, submissionStatus: true },
    },
    sightings: { select: { source: true } },
  }) satisfies Prisma.JobInclude;

const buildWhere = (filters: JobListFilters): Prisma.JobWhereInput => {
  const where: Prisma.JobWhereInput = filters.includeClosed ? {} : { closedAt: null };

  if (filters.role) where.title = { contains: filters.role, mode: "insensitive" };
  if (filters.company) where.company = { contains: filters.company, mode: "insensitive" };
  if (filters.location) where.location = { contains: filters.location, mode: "insensitive" };
  if (typeof filters.minScore === "number") {
    where.matches = { some: { profileId: filters.profileId, score: { gte: filters.minScore } } };
  }
  if (filters.status) {
    where.applications = { some: { profileId: filters.profileId, status: filters.status } };
  }

  return where;
};

const orderFor = (sort: JobSort | undefined): Prisma.JobOrderByWithRelationInput[] =>
  sort === "salary"
    ? [{ salaryMax: "desc" }, { discoveredAt: "desc" }]
    : [{ discoveredAt: "desc" }];

/** Flattens the per-profile arrays back to the single values the UI reads. */
/** The eligibility factor's score, or -1 when the job has never been scored. */
const eligibilityOf = (match: { factors?: unknown } | null): number => {
  if (!match || !Array.isArray(match.factors)) return -1;
  const factor = (match.factors as Array<{ factor?: string; score?: number }>).find(
    (entry) => entry.factor === "WORK_ELIGIBILITY",
  );
  return typeof factor?.score === "number" ? factor.score : -1;
};

const flatten = <
  T extends {
    matches: unknown[];
    applications: unknown[];
  },
>(
  job: T,
) => {
  const { matches, applications, ...rest } = job;
  return {
    ...rest,
    match: (matches[0] ?? null) as T["matches"][number] | null,
    application: (applications[0] ?? null) as T["applications"][number] | null,
  };
};

export const listJobs = async (filters: JobListFilters) => {
  const jobs = await prisma.job.findMany({
    where: buildWhere(filters),
    include: buildInclude(filters.profileId),
    orderBy: orderFor(filters.sort),
  });

  const flattened = filters.reachableOnly
    ? jobs.map(flatten).filter((job) => eligibilityOf(job.match) >= REACHABLE_ELIGIBILITY)
    : jobs.map(flatten);
  if ((filters.sort ?? "score") !== "score") return flattened;

  // Sorted in memory: ordering by a filtered relation puts unscored jobs
  // first in SQL, which buries the results that matter.
  return [...flattened].sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1));
};

export const getJobById = async (id: string, profileId: string) => {
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      matches: { where: { profileId } },
      applications: {
        where: { profileId },
        include: { events: { orderBy: { createdAt: "desc" } } },
      },
      sightings: { orderBy: { firstSeenAt: "asc" } },
    },
  });

  return job === null ? null : flatten(job);
};

/** Distinct values used to populate the dashboard filter dropdowns. */
export const getJobFilterOptions = async () => {
  const [companies, locations] = await Promise.all([
    prisma.job.findMany({ distinct: ["company"], select: { company: true }, orderBy: { company: "asc" } }),
    prisma.job.findMany({ distinct: ["location"], select: { location: true }, orderBy: { location: "asc" } }),
  ]);

  return {
    companies: companies.map((row) => row.company),
    locations: locations.map((row) => row.location),
  };
};

export type JobListItem = Awaited<ReturnType<typeof listJobs>>[number];
export type JobDetail = NonNullable<Awaited<ReturnType<typeof getJobById>>>;

/**
 * Records a job the system never discovered.
 *
 * Most of a search does not happen inside this tool: referrals, LinkedIn,
 * agencies, companies on no ATS we speak. Those applications used to be
 * unrecordable, which meant the outcome loop could only ever learn from the
 * minority of applications the pipeline itself found — the least
 * representative sample available.
 *
 * The row is a real Job so everything downstream works unchanged, marked with
 * a `manual` source so it is never confused for something a board returned and
 * never touched by the staleness sweep.
 */
export const recordExternalJob = async (params: {
  company: string;
  title: string;
  url: string;
  location?: string;
  isRemote?: boolean;
  description?: string;
}) => {
  const company = params.company.trim();
  const title = params.title.trim();
  if (company.length === 0 || title.length === 0) {
    throw new Error("A company and a title are required.");
  }

  // Keyed on what a person can retype identically, so recording the same job
  // twice updates one row instead of creating a second.
  const dedupeKey = `manual:${normalizeCompany(company)}:${normalizeText(title)}`;
  const description = params.description?.trim() || `${title} at ${company}. Recorded by hand.`;

  return prisma.job.upsert({
    where: { dedupeKey },
    create: {
      dedupeKey,
      company,
      title,
      url: params.url.trim(),
      location: params.location?.trim() || "Not stated",
      isRemote: params.isRemote ?? true,
      description,
      descriptionText: description,
      primarySource: "manual",
      lastSeenAt: new Date(),
    },
    update: { lastSeenAt: new Date(), closedAt: null },
  });
};
