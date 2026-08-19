import { describe, expect, test } from "vitest";
import type { CoverLetterDraft, ResumeDraft } from "@job-bot/shared";
import { verifyCoverLetterDraft, verifyResumeDraft } from "../grounding";
import type { SourceProfile, TargetJob } from "../types";

const profile: SourceProfile = {
  slug: "test",
  fullName: "Test Candidate",
  headline: "Software Engineer",
  summary: "Builds things.",
  yearsOfExperience: 6,
  skills: [
    { name: "TypeScript", level: "EXPERT" },
    { name: "PostgreSQL", level: "ADVANCED" },
  ],
  experiences: [
    {
      slug: "acme-engineer",
      company: "Acme",
      role: "Software Engineer",
      employmentType: "FULL_TIME",
      location: "Remote",
      isRemote: true,
      startDate: new Date("2022-01-01"),
      endDate: new Date("2024-01-01"),
      isCurrent: false,
      description: "Built and maintained the billing service.",
      technologies: ["TypeScript", "PostgreSQL"],
      responsibilities: ["Owned the PostgreSQL schema and migration process"],
      achievements: ["Reduced p95 API latency from 820ms to 210ms"],
      projects: [],
    },
  ],
};

const job: TargetJob = {
  company: "Northwind Systems",
  title: "Senior Backend Engineer",
  technologies: ["TypeScript"],
  requirements: [],
  descriptionText: "Backend work.",
};

const draft = (overrides: Partial<ResumeDraft> = {}): ResumeDraft => ({
  summary: "Backend engineer with billing and database ownership.",
  highlightedSkills: ["TypeScript"],
  sections: [
    {
      experienceSlug: "acme-engineer",
      bullets: [
        {
          experienceSlug: "acme-engineer",
          sourceText: "Reduced p95 API latency from 820ms to 210ms",
          text: "Cut p95 API latency from 820ms to 210ms.",
        },
      ],
    },
  ],
  missingInformation: [],
  ...overrides,
});

describe("verifyResumeDraft — fabrication is rejected, not flagged", () => {
  test("accepts a draft whose every bullet quotes recorded text", () => {
    const report = verifyResumeDraft(profile, draft());
    expect(report.ok).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  test("rejects a bullet whose source appears nowhere in the record", () => {
    const report = verifyResumeDraft(
      profile,
      draft({
        sections: [
          {
            experienceSlug: "acme-engineer",
            bullets: [
              {
                experienceSlug: "acme-engineer",
                sourceText: "Led a team of twelve engineers",
                text: "Led a team of twelve engineers.",
              },
            ],
          },
        ],
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.issues[0]?.severity).toBe("error");
    expect(report.issues[0]?.message).toMatch(/not recorded/i);
  });

  test("rejects a section referencing an experience that does not exist", () => {
    const report = verifyResumeDraft(
      profile,
      draft({
        sections: [
          {
            experienceSlug: "google-staff-engineer",
            bullets: [
              {
                experienceSlug: "google-staff-engineer",
                sourceText: "Built distributed systems",
                text: "Built distributed systems.",
              },
            ],
          },
        ],
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.issues[0]?.message).toMatch(/not in the experience database/i);
  });

  test("rejects a highlighted skill the profile does not record", () => {
    const report = verifyResumeDraft(profile, draft({ highlightedSkills: ["TypeScript", "Rust"] }));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.message.includes("Rust"))).toBe(true);
  });

  test("accepts rewording, since only the quoted source must be verbatim", () => {
    const report = verifyResumeDraft(
      profile,
      draft({
        sections: [
          {
            experienceSlug: "acme-engineer",
            bullets: [
              {
                experienceSlug: "acme-engineer",
                sourceText: "Owned the PostgreSQL schema and migration process",
                text: "Owned schema design and migrations across environments.",
              },
            ],
          },
        ],
      }),
    );

    expect(report.ok).toBe(true);
  });

  test("rejects a bullet attributed to a different experience than its section", () => {
    const report = verifyResumeDraft(
      profile,
      draft({
        sections: [
          {
            experienceSlug: "acme-engineer",
            bullets: [
              {
                experienceSlug: "some-other-role",
                sourceText: "Reduced p95 API latency from 820ms to 210ms",
                text: "Cut latency.",
              },
            ],
          },
        ],
      }),
    );

    expect(report.ok).toBe(false);
  });
});

describe("verifyResumeDraft — the claim is checked, not only the quote", () => {
  test("rejects a quote too short to justify anything", () => {
    // "the" appears in almost any record. Accepting it would let a bullet
    // claim anything at all while still passing verification.
    const report = verifyResumeDraft(
      profile,
      draft({
        sections: [
          {
            experienceSlug: "acme-engineer",
            bullets: [
              { experienceSlug: "acme-engineer", sourceText: "the billing", text: "Rebuilt billing from scratch." },
            ],
          },
        ],
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.issues[0]?.message).toMatch(/too short/i);
  });

  test("rejects a bullet that invents a metric its source does not contain", () => {
    const report = verifyResumeDraft(
      profile,
      draft({
        sections: [
          {
            experienceSlug: "acme-engineer",
            bullets: [
              {
                experienceSlug: "acme-engineer",
                sourceText: "Owned the PostgreSQL schema and migration process",
                text: "Owned schema and migrations across 40 services.",
              },
            ],
          },
        ],
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.message.includes("40"))).toBe(true);
  });

  test("accepts a bullet reusing a metric that is recorded", () => {
    const report = verifyResumeDraft(
      profile,
      draft({
        sections: [
          {
            experienceSlug: "acme-engineer",
            bullets: [
              {
                experienceSlug: "acme-engineer",
                sourceText: "Reduced p95 API latency from 820ms to 210ms",
                text: "Cut p95 latency from 820ms to 210ms.",
              },
            ],
          },
        ],
      }),
    );

    expect(report.ok).toBe(true);
  });

  test("warns about an organisation the experience never mentions", () => {
    const report = verifyResumeDraft(
      profile,
      draft({
        sections: [
          {
            experienceSlug: "acme-engineer",
            bullets: [
              {
                experienceSlug: "acme-engineer",
                sourceText: "Owned the PostgreSQL schema and migration process",
                text: "Owned the schema, partnering with Globex Industries.",
              },
            ],
          },
        ],
      }),
    );

    expect(report.issues.some((issue) => issue.message.includes("Globex Industries"))).toBe(true);
  });
});

describe("verifyCoverLetterDraft", () => {
  const letter = (overrides: Partial<CoverLetterDraft> = {}): CoverLetterDraft => ({
    body: "I spent two years at Acme owning the billing service.",
    citedExperienceSlugs: ["acme-engineer"],
    missingInformation: [],
    ...overrides,
  });

  test("accepts a letter citing only recorded experience", () => {
    expect(verifyCoverLetterDraft(profile, job, letter()).ok).toBe(true);
  });

  test("rejects a letter citing experience that does not exist", () => {
    const report = verifyCoverLetterDraft(
      profile,
      job,
      letter({ citedExperienceSlugs: ["stripe-engineer"] }),
    );

    expect(report.ok).toBe(false);
  });

  test("rejects a letter stating a number no cited experience records", () => {
    const report = verifyCoverLetterDraft(
      profile,
      job,
      letter({ body: "At Acme I cut latency by 90% across the platform." }),
    );

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.message.includes("90%"))).toBe(true);
  });

  test("warns about an organisation name that matches nothing on record", () => {
    const report = verifyCoverLetterDraft(
      profile,
      job,
      letter({ body: "At Globex Industries I led the platform team." }),
    );

    expect(report.issues.some((issue) => issue.message.includes("Globex Industries"))).toBe(true);
  });
});
