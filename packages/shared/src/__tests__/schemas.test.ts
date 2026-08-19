import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { dataPath, listProfileSlugs, profilePath } from "../paths";
import { experienceCollectionSchema, experienceSchema } from "../schemas/experience";
import { userProfileSchema } from "../schemas/profile";
import { rawJobCollectionSchema, jobSearchQuerySchema } from "../schemas/job";
import { applicationAnswerSchema } from "../schemas/application";

import { educationCollectionSchema } from "../schemas/education";

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"));

/** Every CV on disk. The system is multi-profile, so every one must validate. */
const SLUGS = listProfileSlugs();
const FIRST_SLUG = SLUGS[0] ?? "";

describe("committed data files", () => {
  test("at least one profile is present", () => {
    expect(SLUGS.length).toBeGreaterThan(0);
  });

  test("mock-jobs.json satisfies the raw job schema", async () => {
    expect(
      rawJobCollectionSchema.safeParse(await readJson(dataPath("jobs", "mock-jobs.json"))).success,
    ).toBe(true);
  });

  test.each(SLUGS)("profile %s: profile.json satisfies the schema", async (slug) => {
    const result = userProfileSchema.safeParse(await readJson(profilePath(slug, "profile.json")));
    expect(result.success).toBe(true);
  });

  test.each(SLUGS)("profile %s: slug matches its directory name", async (slug) => {
    const profile = userProfileSchema.parse(await readJson(profilePath(slug, "profile.json")));
    expect(profile.slug).toBe(slug);
  });

  test.each(SLUGS)("profile %s: experience.json satisfies the schema", async (slug) => {
    const result = experienceCollectionSchema.safeParse(
      await readJson(profilePath(slug, "experience.json")),
    );
    expect(result.success).toBe(true);
  });

  test.each(SLUGS)("profile %s: education.json satisfies the schema", async (slug) => {
    const result = educationCollectionSchema.safeParse(
      await readJson(profilePath(slug, "education.json")),
    );
    expect(result.success).toBe(true);
  });

  test.each(SLUGS)("profile %s: experience slugs are unique", async (slug) => {
    const experiences = experienceCollectionSchema.parse(
      await readJson(profilePath(slug, "experience.json")),
    );
    const slugs = experiences.map((experience) => experience.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("experience slugs are unique across every profile, not just within one", async () => {
    const all: string[] = [];
    for (const slug of SLUGS) {
      const experiences = experienceCollectionSchema.parse(
        await readJson(profilePath(slug, "experience.json")),
      );
      all.push(...experiences.map((experience) => experience.slug));
    }
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("userProfileSchema", () => {
  test("rejects an unknown field rather than silently dropping it", async () => {
    const profile = await readJson(profilePath(FIRST_SLUG, "profile.json"));
    const result = userProfileSchema.safeParse({ ...(profile as object), unexpected: true });
    expect(result.success).toBe(false);
  });

  test("rejects a salary expectation whose minimum exceeds its maximum", async () => {
    const profile = (await readJson(profilePath(FIRST_SLUG, "profile.json"))) as Record<
      string,
      unknown
    >;
    const result = userProfileSchema.safeParse({
      ...profile,
      salaryExpectation: { min: 200000, max: 100000, currency: "USD", period: "YEAR" },
    });
    expect(result.success).toBe(false);
  });
});

describe("experienceSchema", () => {
  const base = {
    slug: "acme-engineer",
    company: "Acme",
    role: "Engineer",
    employmentType: "FULL_TIME" as const,
    location: "Remote",
    isRemote: true,
    startDate: "2020-01-01",
    endDate: "2022-01-01",
    isCurrent: false,
    description: "Did the work.",
    technologies: [],
    responsibilities: [],
    achievements: [],
    projects: [],
  };

  test("accepts a well-formed past role", () => {
    expect(experienceSchema.safeParse(base).success).toBe(true);
  });

  test("rejects a current role that also has an end date", () => {
    expect(
      experienceSchema.safeParse({ ...base, isCurrent: true, endDate: "2022-01-01" }).success,
    ).toBe(false);
  });

  test("rejects a past role with no end date", () => {
    expect(experienceSchema.safeParse({ ...base, isCurrent: false, endDate: null }).success).toBe(
      false,
    );
  });

  test("rejects an end date before the start date", () => {
    expect(experienceSchema.safeParse({ ...base, endDate: "2019-01-01" }).success).toBe(false);
  });
});

describe("jobSearchQuerySchema", () => {
  test("fills every field from defaults for an empty query", () => {
    expect(jobSearchQuerySchema.parse({})).toEqual({
      keywords: [],
      locations: [],
      remoteOnly: false,
      employmentTypes: [],
      minSalary: null,
      postedWithinDays: null,
      limit: 100,
    });
  });
});

describe("applicationAnswerSchema", () => {
  test("requires an explicit experience strength so claims stay qualified", () => {
    const result = applicationAnswerSchema.safeParse({
      question: "What experience do you have with AWS?",
      answer: "I have used GCP extensively; my AWS exposure is limited.",
    });
    expect(result.success).toBe(false);
  });

  test("accepts an answer that records its sources and gaps", () => {
    const result = applicationAnswerSchema.safeParse({
      question: "What experience do you have with AWS?",
      answer: "Primary cloud experience is GCP. AWS exposure is adjacent, not direct.",
      strength: "ADJACENT",
      sourceExperienceSlugs: ["placeholder-labs-senior-engineer"],
      missingInformation: ["No production AWS ownership recorded"],
      requiresHumanInput: true,
    });
    expect(result.success).toBe(true);
  });
});
