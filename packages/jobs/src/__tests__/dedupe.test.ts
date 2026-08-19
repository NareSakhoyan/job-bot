import { describe, expect, test } from "vitest";
import type { RawJob } from "@job-bot/shared";
import { computeDedupeKey, dedupeJobs, normalizeJob } from "../dedupe";

const buildJob = (overrides: Partial<RawJob> = {}): RawJob => ({
  source: "mock",
  externalId: "1",
  url: "https://example.com/jobs/1",
  company: "Northwind Systems Inc.",
  title: "Senior Backend Engineer (TypeScript)",
  location: "Remote — Europe",
  isRemote: true,
  employmentType: "FULL_TIME",
  salary: null,
  description: "Build things.",
  requirements: [],
  responsibilities: [],
  technologies: [],
  postedAt: null,
  ...overrides,
});

describe("computeDedupeKey", () => {
  test("is stable for identical input", () => {
    expect(computeDedupeKey(buildJob())).toBe(computeDedupeKey(buildJob()));
  });

  test("ignores the source the posting came from", () => {
    const a = computeDedupeKey(buildJob({ source: "mock" }));
    const b = computeDedupeKey(buildJob({ source: "mock-aggregator", externalId: "999" }));
    expect(a).toBe(b);
  });

  test("collapses company and location phrasing differences", () => {
    const a = computeDedupeKey(buildJob());
    const b = computeDedupeKey(
      buildJob({ company: "Northwind Systems", location: "Remote", title: "Senior Backend Engineer, TypeScript" }),
    );
    expect(a).toBe(b);
  });

  test("separates different roles at the same company", () => {
    const a = computeDedupeKey(buildJob({ title: "Senior Backend Engineer" }));
    const b = computeDedupeKey(buildJob({ title: "Senior Frontend Engineer" }));
    expect(a).not.toBe(b);
  });

  test("separates the same role in different cities", () => {
    const a = computeDedupeKey(buildJob({ isRemote: false, location: "Berlin, Germany" }));
    const b = computeDedupeKey(buildJob({ isRemote: false, location: "London, UK" }));
    expect(a).not.toBe(b);
  });
});

describe("normalizeJob", () => {
  test("adds a dedupe key and plain-text description without losing the original", () => {
    const normalized = normalizeJob(buildJob({ description: "<p>Build   things.</p>" }));

    expect(normalized.dedupeKey).toHaveLength(32);
    expect(normalized.description).toBe("<p>Build   things.</p>");
    expect(normalized.descriptionText).toBe("Build things.");
  });
});

describe("dedupeJobs", () => {
  test("collapses the same posting reported by two sources", () => {
    const result = dedupeJobs([
      buildJob({ source: "mock", externalId: "a" }),
      buildJob({ source: "mock-aggregator", externalId: "b", company: "Northwind Systems", location: "Remote" }),
    ]);

    expect(result.jobs).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.jobs[0]?.duplicates).toHaveLength(1);
    expect(result.jobs[0]?.duplicates[0]?.source).toBe("mock-aggregator");
  });

  test("keeps the first sighting as the canonical record", () => {
    const result = dedupeJobs([
      buildJob({ source: "mock", externalId: "a" }),
      buildJob({ source: "mock-aggregator", externalId: "b" }),
    ]);

    expect(result.jobs[0]?.job.source).toBe("mock");
  });

  test("keeps genuinely distinct postings apart", () => {
    const result = dedupeJobs([
      buildJob({ externalId: "a", title: "Backend Engineer" }),
      buildJob({ externalId: "b", title: "Frontend Engineer" }),
      buildJob({ externalId: "c", company: "Other Company", title: "Backend Engineer" }),
    ]);

    expect(result.jobs).toHaveLength(3);
    expect(result.duplicateCount).toBe(0);
  });

  test("returns an empty result for an empty batch", () => {
    expect(dedupeJobs([])).toEqual({ jobs: [], duplicateCount: 0 });
  });
});

describe("dedupeJobs — one source listing two openings is two jobs", () => {
  test("does not merge same-source postings with different external ids", () => {
    // A company hiring three accessibility engineers publishes three postings
    // with the same title and location. Merging them loses two real jobs.
    const result = dedupeJobs([
      buildJob({ source: "greenhouse", externalId: "gh:1" }),
      buildJob({ source: "greenhouse", externalId: "gh:2" }),
      buildJob({ source: "greenhouse", externalId: "gh:3" }),
    ]);

    expect(result.jobs).toHaveLength(3);
    expect(new Set(result.jobs.map((entry) => entry.job.dedupeKey)).size).toBe(3);
  });

  test("still merges the same posting seen on two different sources", () => {
    const result = dedupeJobs([
      buildJob({ source: "greenhouse", externalId: "gh:1" }),
      buildJob({ source: "mock-aggregator", externalId: "agg:9", company: "Northwind Systems" }),
    ]);

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.duplicates).toHaveLength(1);
  });

  test("collapses an exact repeat of the same posting", () => {
    const result = dedupeJobs([
      buildJob({ source: "greenhouse", externalId: "gh:1" }),
      buildJob({ source: "greenhouse", externalId: "gh:1" }),
    ]);

    expect(result.jobs).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
  });

  test("a cross-source duplicate still merges into one of several same-source openings", () => {
    const result = dedupeJobs([
      buildJob({ source: "greenhouse", externalId: "gh:1" }),
      buildJob({ source: "greenhouse", externalId: "gh:2" }),
      buildJob({ source: "mock-aggregator", externalId: "agg:9" }),
    ]);

    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.some((entry) => entry.duplicates.length === 1)).toBe(true);
  });
});
