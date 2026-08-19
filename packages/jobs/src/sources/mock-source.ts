import { readFile } from "node:fs/promises";
import {
  dataPath,
  rawJobCollectionSchema,
  type JobSearchQuery,
  type RawJob,
} from "@job-bot/shared";
import type { JobSource } from "../types";

/**
 * Words that appear in nearly every engineering title. A keyword made only of
 * these ("Senior Software Engineer") is a broad target rather than a filter,
 * so it matches everything instead of matching nothing.
 */
const GENERIC_TOKENS = new Set([
  "senior",
  "staff",
  "principal",
  "lead",
  "junior",
  "software",
  "engineer",
  "engineering",
  "developer",
  "specialist",
  "the",
  "and",
  "of",
]);

const distinctiveTokens = (keyword: string): string[] =>
  keyword
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));

/**
 * A keyword matches when all of its distinctive tokens appear in the posting.
 * Matching on the whole phrase would miss "Machine Learning Engineer" against
 * a posting titled "ML Engineer, Machine Learning Platform"; matching on any
 * single token would make "engineer" match everything.
 */
const matchesKeywords = (job: RawJob, keywords: string[]): boolean => {
  if (keywords.length === 0) return true;

  const haystack = [job.title, job.company, job.description, ...job.technologies]
    .join(" ")
    .toLowerCase();

  return keywords.some((keyword) => {
    const tokens = distinctiveTokens(keyword);
    // Nothing distinctive left: the keyword is a broad target, not a filter.
    if (tokens.length === 0) return true;
    return tokens.every((token) => haystack.includes(token));
  });
};

const matchesLocations = (job: RawJob, locations: string[]): boolean => {
  if (locations.length === 0) return true;
  if (job.isRemote) return true;

  const location = job.location.toLowerCase();
  return locations.some((candidate) => location.includes(candidate.toLowerCase()));
};

const matchesSalary = (job: RawJob, minSalary: number | null): boolean => {
  if (minSalary === null) return true;
  // A posting without a published range is kept: absence of data is not a
  // reason to discard a job at discovery time.
  if (!job.salary) return true;

  const ceiling = job.salary.max ?? job.salary.min;
  return ceiling === null || ceiling >= minSalary;
};

const matchesRecency = (job: RawJob, postedWithinDays: number | null, now: Date): boolean => {
  if (postedWithinDays === null || job.postedAt === null) return true;

  const ageMs = now.getTime() - new Date(job.postedAt).getTime();
  return ageMs <= postedWithinDays * 24 * 60 * 60 * 1000;
};

/**
 * Reads postings from data/jobs/mock-jobs.json so the whole pipeline is
 * exercisable without touching any external website. It applies the same
 * JobSearchQuery semantics a real adapter must implement.
 */
export class MockJobSource implements JobSource {
  readonly id = "mock";
  readonly displayName = "Mock Job Board";
  readonly returnsFullCatalogue = true;

  constructor(
    private readonly filePath: string = dataPath("jobs", "mock-jobs.json"),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async search(query: JobSearchQuery): Promise<RawJob[]> {
    const jobs = await this.loadJobs();
    const now = this.now();

    return jobs
      .filter((job) => (query.remoteOnly ? job.isRemote : true))
      .filter((job) => matchesKeywords(job, query.keywords))
      .filter((job) => matchesLocations(job, query.locations))
      .filter(
        (job) =>
          query.employmentTypes.length === 0 ||
          (job.employmentType !== null && query.employmentTypes.includes(job.employmentType)),
      )
      .filter((job) => matchesSalary(job, query.minSalary))
      .filter((job) => matchesRecency(job, query.postedWithinDays, now))
      .slice(0, query.limit);
  }

  private async loadJobs(): Promise<RawJob[]> {
    const contents = await readFile(this.filePath, "utf8");
    const parsed = rawJobCollectionSchema.safeParse(JSON.parse(contents));

    if (!parsed.success) {
      throw new Error(
        `Invalid mock job fixture at ${this.filePath}:\n${parsed.error.issues
          .map((issue) => `  - [${issue.path.join(".")}] ${issue.message}`)
          .join("\n")}`,
      );
    }

    return parsed.data;
  }
}
