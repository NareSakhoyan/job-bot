import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { jobSearchQuerySchema, listProfileSlugs, profilePath, resolveDataDir } from "@job-bot/shared";
import { MockJobSource } from "../sources/mock-source";
import { discoverJobs } from "../discovery";

const FIXTURE_NOW = new Date("2026-08-18T00:00:00.000Z");

const buildSource = () =>
  new MockJobSource(join(resolveDataDir(), "jobs", "mock-jobs.json"), () => FIXTURE_NOW);

const query = (overrides: Parameters<typeof jobSearchQuerySchema.parse>[0] = {}) =>
  jobSearchQuerySchema.parse(overrides);

describe("MockJobSource", () => {
  test("returns every fixture posting for an empty query", async () => {
    const jobs = await buildSource().search(query());
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((job) => job.company.length > 0)).toBe(true);
  });

  test("filters by keyword across title, company, description and technologies", async () => {
    const jobs = await buildSource().search(query({ keywords: ["ClickHouse"] }));

    expect(jobs.length).toBeGreaterThan(0);
    expect(
      jobs.every((job) =>
        [job.title, job.company, job.description, ...job.technologies]
          .join(" ")
          .toLowerCase()
          .includes("clickhouse"),
      ),
    ).toBe(true);
  });

  test("returns only remote postings when remoteOnly is set", async () => {
    const jobs = await buildSource().search(query({ remoteOnly: true }));
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((job) => job.isRemote)).toBe(true);
  });

  test("filters by employment type", async () => {
    const jobs = await buildSource().search(query({ employmentTypes: ["INTERNSHIP"] }));
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((job) => job.employmentType === "INTERNSHIP")).toBe(true);
  });

  test("keeps postings with no published salary when a minimum is set", async () => {
    const jobs = await buildSource().search(query({ minSalary: 100000 }));

    expect(jobs.some((job) => job.salary === null)).toBe(true);
    expect(
      jobs.every((job) => job.salary === null || (job.salary.max ?? job.salary.min ?? 0) >= 100000),
    ).toBe(true);
  });

  test("filters by recency against the injected clock", async () => {
    const jobs = await buildSource().search(query({ postedWithinDays: 5 }));

    expect(jobs.length).toBeGreaterThan(0);
    expect(
      jobs.every((job) => {
        if (job.postedAt === null) return true;
        const ageDays = (FIXTURE_NOW.getTime() - new Date(job.postedAt).getTime()) / 86_400_000;
        return ageDays <= 5;
      }),
    ).toBe(true);
  });

  test("honours the result limit", async () => {
    const jobs = await buildSource().search(query({ limit: 3 }));
    expect(jobs).toHaveLength(3);
  });

  test("rejects a malformed fixture instead of returning partial data", async () => {
    // Any well-formed JSON that is not a job list will do.
    const notAJobFixture = profilePath(listProfileSlugs()[0] ?? "", "profile.json");
    const source = new MockJobSource(notAJobFixture);
    await expect(source.search(query())).rejects.toThrow(/failed validation|Invalid mock job fixture/i);
  });
});

describe("discoverJobs", () => {
  test("collapses the duplicate postings present in the fixture", async () => {
    const outcome = await discoverJobs([buildSource()], {});

    expect(outcome.duplicateCount).toBeGreaterThan(0);
    expect(outcome.jobs.length).toBeLessThan(outcome.bySource.mock ?? 0);
    expect(outcome.errors).toHaveLength(0);
  });

  test("produces one entry per distinct dedupe key", async () => {
    const outcome = await discoverJobs([buildSource()], {});
    const keys = new Set(outcome.jobs.map((entry) => entry.job.dedupeKey));

    expect(keys.size).toBe(outcome.jobs.length);
  });

  test("degrades rather than fails when a source throws", async () => {
    const failing = {
      id: "broken",
      displayName: "Broken Source",
      search: async () => {
        throw new Error("upstream unavailable");
      },
      returnsFullCatalogue: true,
    };

    const outcome = await discoverJobs([buildSource(), failing], {});

    expect(outcome.errors).toEqual([{ source: "broken", message: "upstream unavailable" }]);
    expect(outcome.jobs.length).toBeGreaterThan(0);
  });
});

describe("MockJobSource — keyword matching is token-based", () => {
  test("a multi-word role matches a posting that words it differently", async () => {
    const jobs = await buildSource().search(query({ keywords: ["Machine Learning Engineer"] }));

    expect(jobs.length).toBeGreaterThan(0);
    expect(
      jobs.every((job) => {
        const haystack = `${job.title} ${job.description} ${job.technologies.join(" ")}`.toLowerCase();
        return haystack.includes("machine") && haystack.includes("learning");
      }),
    ).toBe(true);
  });

  test("a keyword made only of generic words is treated as a broad target", async () => {
    const broad = await buildSource().search(query({ keywords: ["Senior Software Engineer"] }));
    const all = await buildSource().search(query());

    expect(broad).toHaveLength(all.length);
  });

  test("a distinctive keyword still narrows the result set", async () => {
    const narrow = await buildSource().search(query({ keywords: ["Computer Vision Engineer"] }));
    const all = await buildSource().search(query());

    expect(narrow.length).toBeGreaterThan(0);
    expect(narrow.length).toBeLessThan(all.length);
  });
});
