import { describe, expect, test } from "vitest";
import type { MatchJob, MatchProfile } from "@job-bot/shared";
import { scoreMatch } from "../score";
import { BLOCKED_SCORE_CEILING, SCORE_GATES } from "../weights";

const gateCeiling = (factor: string): number =>
  SCORE_GATES.find((gate) => gate.factor === factor)?.ceiling ?? 100;

const buildProfile = (overrides: Partial<MatchProfile> = {}): MatchProfile => ({
  yearsOfExperience: 6,
  targetRoles: ["Senior Software Engineer", "Backend Engineer"],
  skills: [
    { name: "TypeScript", level: "EXPERT" },
    { name: "Node.js", level: "EXPERT" },
    { name: "PostgreSQL", level: "ADVANCED" },
    { name: "Docker", level: "BEGINNER" },
  ],
  experienceTechnologies: ["TypeScript", "Node.js", "PostgreSQL", "Docker", "GraphQL"],
  preferredLocations: ["Remote"],
  remotePreference: "REMOTE_ONLY",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: "USD",
  salaryPeriod: "YEAR",
  employmentTypes: ["FULL_TIME", "CONTRACT"],
  excludedCompanies: [],
  excludedTechnologies: [],
  requiresSponsorship: false,
  workAuthCountry: "Armenia",
  willRelocate: false,
  ...overrides,
});

const buildJob = (overrides: Partial<MatchJob> = {}): MatchJob => ({
  company: "Northwind Systems",
  title: "Senior Backend Engineer",
  location: "Remote",
  isRemote: true,
  employmentType: "FULL_TIME",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
  requirements: [],
  technologies: ["TypeScript", "Node.js", "PostgreSQL"],
  descriptionText: "Build backend services.",
  companySize: null,
  ...overrides,
});

describe("scoreMatch — the score is bounded and explainable", () => {
  test("produces a score within 0-100 and a factor for every dimension", () => {
    const result = scoreMatch(buildProfile(), buildJob());

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.factors.map((factor) => factor.factor).sort()).toEqual([
      "EMPLOYMENT_TYPE",
      "LOCATION",
      "ROLE",
      "SALARY",
      "SENIORITY",
      "TECHNICAL_SKILLS",
      "WORK_ELIGIBILITY",
    ]);
  });

  test("scores a well-aligned job highly", () => {
    const result = scoreMatch(buildProfile(), buildJob());

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.recommendation).toBe("STRONG_MATCH");
  });

  test("applicable factor weights sum to 1 so the score is a true weighted average", () => {
    const result = scoreMatch(buildProfile(), buildJob());
    const total = result.factors.reduce((sum, factor) => sum + factor.weight, 0);

    expect(total).toBeCloseTo(1, 5);
  });
});

describe("scoreMatch — missing data must not look like a bad match", () => {
  test("a job with no published salary is not penalised for it", () => {
    const withSalaryExpectation = buildProfile({ salaryMin: 100_000, salaryMax: 140_000 });
    const result = scoreMatch(withSalaryExpectation, buildJob({ salaryMin: null, salaryMax: null }));

    const salary = result.factors.find((factor) => factor.factor === "SALARY");
    expect(salary?.weight).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  test("an unassessable factor has its weight redistributed, not zeroed into the score", () => {
    const noEmploymentType = scoreMatch(buildProfile(), buildJob({ employmentType: null }));
    const total = noEmploymentType.factors.reduce((sum, factor) => sum + factor.weight, 0);

    expect(noEmploymentType.factors.find((f) => f.factor === "EMPLOYMENT_TYPE")?.weight).toBe(0);
    expect(total).toBeCloseTo(1, 5);
  });

  test("salaries in different currencies are not compared", () => {
    const profile = buildProfile({ salaryMin: 100_000, salaryCurrency: "USD" });
    const job = buildJob({ salaryMin: 60_000, salaryMax: 70_000, salaryCurrency: "EUR", salaryPeriod: "YEAR" });

    const salary = scoreMatch(profile, job).factors.find((factor) => factor.factor === "SALARY");
    expect(salary?.weight).toBe(0);
    expect(salary?.detail).toMatch(/not comparable/i);
  });
});

describe("scoreMatch — hard exclusions cap the score", () => {
  test("an excluded company caps the score and forces NOT_RECOMMENDED", () => {
    const profile = buildProfile({ excludedCompanies: ["Northwind Systems Inc."] });
    const result = scoreMatch(profile, buildJob());

    expect(result.score).toBeLessThanOrEqual(BLOCKED_SCORE_CEILING);
    expect(result.recommendation).toBe("NOT_RECOMMENDED");
    expect(result.blockers).toHaveLength(1);
  });

  test("an excluded technology caps the score even on an otherwise perfect job", () => {
    const profile = buildProfile({ excludedTechnologies: ["PHP"] });
    const result = scoreMatch(profile, buildJob({ technologies: ["TypeScript", "PHP"] }));

    expect(result.score).toBeLessThanOrEqual(BLOCKED_SCORE_CEILING);
    expect(result.recommendation).toBe("NOT_RECOMMENDED");
  });
});

describe("scoreMatch — the skills gate", () => {
  test("a job with no technology overlap cannot score as a real match", () => {
    const result = scoreMatch(
      buildProfile(),
      buildJob({ technologies: ["C++", "Rust", "Assembly"] }),
    );

    expect(result.score).toBeLessThanOrEqual(gateCeiling("TECHNICAL_SKILLS"));
    expect(result.concerns.some((concern) => /technologies/i.test(concern))).toBe(true);
  });

  test("the gate does not fire when the stack genuinely overlaps", () => {
    const result = scoreMatch(buildProfile(), buildJob());
    expect(result.score).toBeGreaterThan(gateCeiling("TECHNICAL_SKILLS"));
  });
});

describe("scoreMatch — remote-only is respected", () => {
  test("an on-site role scores near zero on location for a remote-only candidate", () => {
    const result = scoreMatch(
      buildProfile(),
      buildJob({ isRemote: false, location: "Berlin, Germany" }),
    );

    const location = result.factors.find((factor) => factor.factor === "LOCATION");
    expect(location?.score).toBeLessThan(20);
    // The location gate must stop a dealbreaker being averaged away.
    expect(result.score).toBeLessThanOrEqual(gateCeiling("LOCATION"));
  });

  test("sponsorship is reported as a concern, never silently folded into the score", () => {
    const profile = buildProfile({ requiresSponsorship: true });
    const job = buildJob({ isRemote: false, location: "London, United Kingdom" });

    const result = scoreMatch(profile, job);
    expect(result.concerns.some((concern) => /sponsor/i.test(concern))).toBe(true);
  });

  test("the posting text is never read for sponsorship language", () => {
    const profile = buildProfile({ requiresSponsorship: true });

    // A posting that says it will not sponsor must be treated exactly like one
    // that says nothing: whether an employer sponsors is a question to ask
    // them, not something to infer from prose.
    const claims = scoreMatch(
      profile,
      buildJob({
        isRemote: false,
        location: "London, United Kingdom",
        descriptionText: "We are unable to sponsor visas for this position.",
      }),
    );
    const silent = scoreMatch(
      profile,
      buildJob({ isRemote: false, location: "London, United Kingdom" }),
    );

    expect(claims.concerns).toEqual(silent.concerns);
    expect(claims.concerns.some((c) => /unable to sponsor/i.test(c))).toBe(false);
  });
});

describe("scoreMatch — skill level changes the weight a match carries", () => {
  test("expert-level skills score higher than beginner-level ones on the same job", () => {
    const job = buildJob({ technologies: ["Kubernetes"] });

    const expert = scoreMatch(
      buildProfile({
        skills: [{ name: "Kubernetes", level: "EXPERT" }],
        experienceTechnologies: ["Kubernetes"],
      }),
      job,
    );
    const beginner = scoreMatch(
      buildProfile({
        skills: [{ name: "Kubernetes", level: "BEGINNER" }],
        experienceTechnologies: ["Kubernetes"],
      }),
      job,
    );

    const scoreOf = (result: ReturnType<typeof scoreMatch>) =>
      result.factors.find((factor) => factor.factor === "TECHNICAL_SKILLS")?.score ?? 0;

    expect(scoreOf(expert)).toBeGreaterThan(scoreOf(beginner));
  });

  test("a technology used in a real role counts even when it is not a rated skill", () => {
    const profile = buildProfile({ skills: [], experienceTechnologies: ["GraphQL"] });
    const result = scoreMatch(profile, buildJob({ technologies: ["GraphQL"] }));

    expect(result.matchingSkills).toContain("GraphQL");
    expect(result.missingSkills).toHaveLength(0);
  });

  test("a technology recorded nowhere is reported as missing", () => {
    const result = scoreMatch(buildProfile(), buildJob({ technologies: ["TypeScript", "Elixir"] }));

    expect(result.matchingSkills).toContain("TypeScript");
    expect(result.missingSkills).toEqual(["Elixir"]);
  });
});

describe("scoreMatch — seniority", () => {
  test("under-qualification costs more than over-qualification", () => {
    const junior = buildProfile({ yearsOfExperience: 1 });
    const veteran = buildProfile({ yearsOfExperience: 25 });

    const seniorityOf = (profile: MatchProfile) =>
      scoreMatch(profile, buildJob({ title: "Staff Software Engineer" })).factors.find(
        (factor) => factor.factor === "SENIORITY",
      )?.score ?? 0;

    expect(seniorityOf(junior)).toBeLessThan(seniorityOf(veteran));
  });

  test("a title with no seniority marker leaves the factor unassessed", () => {
    const result = scoreMatch(buildProfile(), buildJob({ title: "Software Engineer" }));
    expect(result.factors.find((factor) => factor.factor === "SENIORITY")?.weight).toBe(0);
  });
});

describe("scoreMatch — an unassessable dominant factor must not inflate the score", () => {
  test("a posting with no recognisable technologies cannot reach a top score", () => {
    const result = scoreMatch(buildProfile(), buildJob({ technologies: [] }));

    // Title, location and employment type all score 100 here; without the cap
    // the redistribution would hand this a perfect score on no technical
    // evidence at all.
    expect(result.factors.find((f) => f.factor === "TECHNICAL_SKILLS")?.weight).toBe(0);
    expect(result.score).toBeLessThanOrEqual(55);
    expect(result.concerns.some((c) => /could not be assessed/i.test(c))).toBe(true);
  });

  test("a posting that does list technologies is unaffected", () => {
    expect(scoreMatch(buildProfile(), buildJob()).score).toBeGreaterThan(55);
  });
});
