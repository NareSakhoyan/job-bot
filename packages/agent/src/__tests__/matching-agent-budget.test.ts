import { describe, expect, test } from "vitest";
import type { MatchJob, MatchProfile } from "@job-bot/shared";
import { MatchingAgent } from "../agents/matching-agent";
import { createCallBudget } from "../llm/call-budget";
import type { GenerateStructuredParams, LLMProvider, LLMResult } from "../llm/provider";

/** A provider that never touches the network and counts what was asked of it. */
class CountingProvider implements LLMProvider {
  readonly id = "counting";
  readonly model = "counting/v1";
  readonly available = true;
  calls = 0;

  async generateStructured<S extends { _output: unknown }>(
    _params: GenerateStructuredParams<never>,
  ): Promise<LLMResult<unknown>> {
    this.calls += 1;
    return {
      ok: true,
      data: {
        matchingSkills: ["TypeScript"],
        missingSkills: [],
        concerns: [],
        reasoning: "Strong overlap with the recorded stack.",
        confidence: 0.8,
      },
      model: this.model,
      usage: { inputTokens: 10, outputTokens: 10, cachedInputTokens: 0 },
    };
  }
}

const profile: MatchProfile = {
  yearsOfExperience: 6,
  targetRoles: ["Senior Backend Engineer"],
  skills: [
    { name: "TypeScript", level: "EXPERT" },
    { name: "Node.js", level: "EXPERT" },
    { name: "PostgreSQL", level: "ADVANCED" },
  ],
  experienceTechnologies: ["TypeScript", "Node.js", "PostgreSQL"],
  preferredLocations: ["Remote"],
  remotePreference: "REMOTE_ONLY",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: "USD",
  salaryPeriod: "YEAR",
  employmentTypes: ["FULL_TIME"],
  excludedCompanies: [],
  excludedTechnologies: [],
  requiresSponsorship: false,
  workAuthCountry: "Armenia",
  willRelocate: false,
};

const job: MatchJob = {
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
};

describe("MatchingAgent — the call budget bounds model spend", () => {
  test("stops calling the model once the budget is spent", async () => {
    // Arrange
    const provider = new CountingProvider();
    const budget = createCallBudget(2);
    const agent = new MatchingAgent(provider as unknown as LLMProvider, { callBudget: budget });

    // Act
    const results = [
      await agent.evaluate(profile, job),
      await agent.evaluate(profile, job),
      await agent.evaluate(profile, job),
    ];

    // Assert
    expect(provider.calls).toBe(2);
    expect(results.map((result) => result.reasonedByModel)).toEqual([true, true, false]);
  });

  test("still returns a complete deterministic match after the budget is spent", async () => {
    const provider = new CountingProvider();
    const agent = new MatchingAgent(provider as unknown as LLMProvider, {
      callBudget: createCallBudget(0),
    });

    const result = await agent.evaluate(profile, job);

    expect(provider.calls).toBe(0);
    expect(result.reasonedByModel).toBe(false);
    expect(result.score).toBe(result.deterministicScore);
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.factors.length).toBeGreaterThan(0);
  });

  test("does not spend budget on a job below the reasoning threshold", async () => {
    const provider = new CountingProvider();
    const budget = createCallBudget(5);
    const agent = new MatchingAgent(provider as unknown as LLMProvider, {
      reasoningThreshold: 101,
      callBudget: budget,
    });

    await agent.evaluate(profile, job);

    expect(provider.calls).toBe(0);
    expect(budget.spent).toBe(0);
  });

  test("makes unbounded calls when no budget is given", async () => {
    const provider = new CountingProvider();
    const agent = new MatchingAgent(provider as unknown as LLMProvider);

    await agent.evaluate(profile, job);
    await agent.evaluate(profile, job);
    await agent.evaluate(profile, job);

    expect(provider.calls).toBe(3);
  });
});
