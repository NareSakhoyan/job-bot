import {
  ensureApplication,
  listProfiles,
  listJobsForMatching,
  prisma,
  resolveProfile,
  saveJobMatch,
  transitionApplication,
} from "@job-bot/database";
import {
  ArbeitnowJobSource,
  AshbyJobSource,
  StaffAmJobSource,
  GreenhouseJobSource,
  LeverJobSource,
  MockJobSource,
  discoverJobs,
  type AshbyBoard,
  type GreenhouseBoard,
  type CompanyProfile,
  type JobSource,
  setTechnologyVocabulary,
  type LeverCompany,
} from "@job-bot/jobs";
import { readFile } from "node:fs/promises";
import { MatchingAgent, createLLMProvider, type CallBudget } from "@job-bot/agent";
import {
  createLogger,
  type ApplicationStatus,
  type JobSearchQueryInput,
  dataPath,
  type NormalizedJob,
} from "@job-bot/shared";
import { toMatchJob, toMatchProfile } from "./mappers";

const logger = createLogger("worker");

const ACTOR = "worker";

/** Matched in parallel by default; --concurrency overrides it. */
const DEFAULT_MATCH_CONCURRENCY = 6;

/**
 * The configured sources.
 *
 * The mock source is always present so the pipeline stays exercisable offline.
 * Real sources are added when their configuration exists — Greenhouse reads
 * the board watchlist in data/sources/. Adding a source is adding an entry
 * here; nothing downstream changes, because everything speaks RawJob.
 */
/** Reads a watchlist, treating a missing or empty file as "not configured". */
const readWatchlist = async <T>(file: string): Promise<T[]> => {
  try {
    const parsed = JSON.parse(await readFile(dataPath("sources", file), "utf8")) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** Reads a single JSON config object, treating a missing file as absent. */
const readConfig = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(dataPath("sources", file), "utf8")) as T;
  } catch {
    return null;
  }
};

/**
 * The configured sources.
 *
 * Adding a source is adding an adapter and a watchlist file; nothing
 * downstream changes, because everything speaks RawJob. The mock source is a
 * test fixture rather than a source, so it is opt-in — otherwise invented
 * companies end up ranked alongside real ones.
 */
const buildSources = async (): Promise<JobSource[]> => {
  // Terms are data, so adding one never requires a rebuild.
  const vocabulary = await readWatchlist<string>("technologies.json");
  if (vocabulary.length > 0) setTechnologyVocabulary(vocabulary);

  const sources: JobSource[] = [];

  if (process.env.USE_MOCK_SOURCE === "true") sources.push(new MockJobSource());

  const greenhouse = await readWatchlist<GreenhouseBoard>("greenhouse-boards.json");
  if (greenhouse.length > 0) sources.push(new GreenhouseJobSource(greenhouse));

  const lever = await readWatchlist<LeverCompany>("lever-companies.json");
  if (lever.length > 0) sources.push(new LeverJobSource(lever));

  const ashby = await readWatchlist<AshbyBoard>("ashby-boards.json");
  if (ashby.length > 0) sources.push(new AshbyJobSource(ashby));

  // The one source that is not a company watchlist: a European feed, enabled
  // by its own config file so it can be turned off without a code change.
  const arbeitnow = await readConfig<{ enabled?: boolean; pages?: number; remoteOnly?: boolean }>(
    "arbeitnow.json",
  );
  if (arbeitnow?.enabled) {
    sources.push(new ArbeitnowJobSource({ pages: arbeitnow.pages, remoteOnly: arbeitnow.remoteOnly }));
  }

  // The candidate's own market. On-site and hybrid roles here are the only
  // ones not blocked on a visa, so this source is not filtered to remote.
  const staffam = await readConfig<{
    enabled?: boolean;
    pages?: number;
    remoteOnly?: boolean;
    categories?: string[];
    fetchDetails?: boolean;
  }>("staffam.json");
  if (staffam?.enabled) {
    sources.push(
      new StaffAmJobSource({
        pages: staffam.pages,
        remoteOnly: staffam.remoteOnly,
        categories: staffam.categories,
        fetchDetails: staffam.fetchDetails,
      }),
    );
  }

  if (sources.length === 0) {
    throw new Error(
      "No job sources configured. Add a watchlist under data/sources/, or set USE_MOCK_SOURCE=true to run against the local fixtures.",
    );
  }

  return sources;
};

/**
 * Marks postings that the sources no longer return as closed.
 *
 * Sound only because discovery fetches unfiltered catalogues: "absent from
 * this run" then genuinely means "taken down", not "did not match a query".
 * Only sources that answered are considered — a board that failed to respond
 * must not have its whole catalogue declared closed.
 */
const closeUnseenJobs = async (seenJobIds: string[], respondingSources: string[]): Promise<number> => {
  if (respondingSources.length === 0) return 0;

  const closed = await prisma.job.updateMany({
    where: {
      primarySource: { in: respondingSources },
      closedAt: null,
      id: { notIn: seenJobIds },
    },
    data: { closedAt: new Date() },
  });

  return closed.count;
};

const persistJob = async (job: NormalizedJob, duplicates: NormalizedJob[]) => {
  const jobData = {
    company: job.company,
    title: job.title,
    location: job.location,
    isRemote: job.isRemote,
    employmentType: job.employmentType,
    salaryMin: job.salary?.min ?? null,
    salaryMax: job.salary?.max ?? null,
    salaryCurrency: job.salary?.currency ?? null,
    salaryPeriod: job.salary?.period ?? null,
    description: job.description,
    descriptionText: job.descriptionText,
    requirements: job.requirements,
    responsibilities: job.responsibilities,
    technologies: job.technologies,
    postedAt: job.postedAt ? new Date(job.postedAt) : null,
    url: job.url,
    primarySource: job.source,
  };

  const saved = await prisma.job.upsert({
    where: { dedupeKey: job.dedupeKey },
    // Seeing a posting again reopens it and refreshes its staleness clock.
    create: { dedupeKey: job.dedupeKey, ...jobData, lastSeenAt: new Date() },
    update: { ...jobData, lastSeenAt: new Date(), closedAt: null },
  });

  for (const sighting of [job, ...duplicates]) {
    await prisma.jobSighting.upsert({
      where: { source_externalId: { source: sighting.source, externalId: sighting.externalId } },
      create: {
        jobId: saved.id,
        source: sighting.source,
        externalId: sighting.externalId,
        url: sighting.url,
        rawPayload: JSON.parse(JSON.stringify(sighting)),
      },
      update: { jobId: saved.id, url: sighting.url, lastSeenAt: new Date() },
    });
  }

  return saved;
};

/**
 * Searches once and persists everything found.
 *
 * Board sources return a company's whole list regardless of query, so running
 * them once per profile multiplied the network cost by the number of CVs
 * without changing the result. Relevance is matching's job, not discovery's —
 * so discovery casts the union of every profile's keywords and lets the scorer
 * decide. `JobSearchQuery` stays in the interface for sources that genuinely
 * search server-side.
 */
export const runDiscovery = async () => {
  const profiles = await listProfiles();
  if (profiles.length === 0) {
    throw new Error("No profiles found. Run pnpm db:seed before discovery.");
  }

  // Discovery fetches whole catalogues and does not filter.
  //
  // Board sources return every posting regardless of query and filter
  // client-side, so a keyword filter here buys nothing — and it actively
  // breaks staleness detection: a live posting that simply does not match
  // today's keywords would look identical to one taken down. Relevance is
  // matching's job; discovery's job is to know what exists.
  const query: JobSearchQueryInput = { limit: 5000 };

  const sources = await buildSources();
  const outcome = await discoverJobs(sources, query);
  const seenJobIds: string[] = [];

  for (const entry of outcome.jobs) {
    const job = await persistJob(entry.job, entry.duplicates);
    seenJobIds.push(job.id);
  }

  // Only sources that return their whole catalogue may close a posting. A
  // rolling feed's silence means "outside the window", not "taken down".
  const completeSources = new Set(
    sources.filter((source) => source.returnsFullCatalogue).map((source) => source.id),
  );
  const responded = [...new Set(outcome.jobs.map((entry) => entry.job.source))];
  const closed = await closeUnseenJobs(
    seenJobIds,
    responded.filter((id) => completeSources.has(id)),
  );

  logger.info("Discovery persisted", {
    distinct: outcome.jobs.length,
    duplicatesCollapsed: outcome.duplicateCount,
    bySource: outcome.bySource,
    errors: outcome.errors.length,
    closed,
  });

  return { discovered: outcome.jobs.length, duplicates: outcome.duplicateCount, closed };
};

/**
 * Runs an async operation over a list with a bounded number in flight.
 *
 * Matching is network-bound, so running one job at a time wastes almost all of
 * the wall clock. The bound keeps a large batch from opening hundreds of
 * concurrent requests and hitting rate limits.
 */
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index] as T);
    }
  });

  await Promise.all(runners);
  return results;
};

export const runMatching = async (
  options: {
    rescoreAll?: boolean;
    profileSlug?: string | null;
    /** Below this deterministic score, no model call is made. */
    reasoningThreshold?: number;
    concurrency?: number;
    /**
     * A ceiling on model calls, shared across every profile in one invocation.
     * Passing the same budget to each call is what makes `--max-calls` a
     * ceiling for the run rather than a ceiling per profile.
     */
    callBudget?: CallBudget;
  } = {},
) => {
  const profileRecord = await resolveProfile(options.profileSlug);
  if (!profileRecord) {
    throw new Error("No profile found. Run pnpm db:seed before matching.");
  }

  // Employer facts are data, so a company's size can be corrected without a
  // rebuild — and matching stays pure by being handed the answer.
  const companies = await readWatchlist<CompanyProfile>("companies.json");

  const provider = createLLMProvider(process.env, { task: "matching" });
  const agent = new MatchingAgent(provider, {
    reasoningThreshold: options.reasoningThreshold,
    callBudget: options.callBudget,
  });
  const profile = toMatchProfile(profileRecord);

  // Bounded rather than unlimited: matching is network-bound, but an
  // unbounded fan-out opens a connection per job and trips provider rate
  // limits. The call budget stays correct under concurrency because reserving
  // a call is a synchronous check-and-increment that cannot interleave.
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_MATCH_CONCURRENCY);

  const jobs = await listJobsForMatching(profileRecord.id, {
    includeScored: options.rescoreAll,
  });
  logger.info("Matching started", {
    profile: profileRecord.slug,
    jobs: jobs.length,
    provider: provider.id,
    model: provider.model,
    rescoreAll: options.rescoreAll === true,
    callsRemaining: options.callBudget ? options.callBudget.remaining : "unlimited",
  });

  let reasoned = 0;
  let done = 0;

  await mapWithConcurrency(jobs, concurrency, async (job) => {
    const result = await agent.evaluate(profile, toMatchJob(job, companies));

    done += 1;
    if (result.reasonedByModel) reasoned += 1;
    // A run over a couple of thousand jobs is silent for its whole middle
    // otherwise; the dashboard runner reads these lines as its progress bar.
    if (done % 100 === 0 || done === jobs.length) {
      logger.info("Matching progress", { profile: profileRecord.slug, done, total: jobs.length });
    }

    await saveJobMatch(profileRecord.id, job.id, result);

    const application = await ensureApplication(profileRecord.id, job.id, ACTOR);
    // Only advance the early, agent-owned part of the pipeline. Anything a
    // human has already moved forward is left alone.
    if (application.status !== "DISCOVERED" && application.status !== "ANALYZED") return;

    const toStatus: ApplicationStatus = result.score >= 65 ? "SHORTLISTED" : "ANALYZED";
    await transitionApplication({
      applicationId: application.id,
      toStatus,
      actor: ACTOR,
      message: `Scored ${result.score}/100 (${result.recommendation})`,
      metadata: { modelVersion: result.modelVersion, reasonedByModel: result.reasonedByModel },
    });
  });

  logger.info("Matching completed", {
    profile: profileRecord.slug,
    scored: jobs.length,
    reasonedByModel: reasoned,
    skippedModelCalls: jobs.length - reasoned,
    callsRemaining: options.callBudget ? options.callBudget.remaining : "unlimited",
  });
  return { profile: profileRecord.slug, scored: jobs.length, reasoned };
};
