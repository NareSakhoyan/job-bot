import { z } from "zod";
import { MATCH_RECOMMENDATIONS } from "../enums";

const nonEmpty = z.string().trim().min(1);

/**
 * The deterministic half of the hybrid scorer. Each factor is scored 0-100 and
 * carries the weight that produced the aggregate, so a score is always
 * explainable without asking the LLM. Populated in Phase 2.
 */
export const matchFactorSchema = z
  .object({
    factor: z.enum([
      "TECHNICAL_SKILLS",
      "ROLE",
      "SENIORITY",
      "LOCATION",
      "WORK_ELIGIBILITY",
      "SALARY",
      "EMPLOYMENT_TYPE",
    ]),
    score: z.number().min(0).max(100),
    weight: z.number().min(0).max(1),
    detail: z.string(),
  })
  .strict();

export const matchFactorsSchema = z.array(matchFactorSchema);

/**
 * The structured output the LLM is required to return. The LLM explains and
 * qualifies a match; it never sets the score itself.
 */
export const matchReasoningSchema = z
  .object({
    matchingSkills: z.array(nonEmpty).default([]),
    missingSkills: z.array(nonEmpty).default([]),
    concerns: z.array(nonEmpty).default([]),
    reasoning: nonEmpty,
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const jobMatchSchema = z
  .object({
    score: z.number().min(0).max(100),
    deterministicScore: z.number().min(0).max(100),
    recommendation: z.enum(MATCH_RECOMMENDATIONS),
    factors: matchFactorsSchema,
    matchingSkills: z.array(nonEmpty),
    missingSkills: z.array(nonEmpty),
    concerns: z.array(nonEmpty),
    reasoning: z.string(),
    confidence: z.number().min(0).max(1),
    modelVersion: z.string(),
  })
  .strict();

export type MatchFactor = z.infer<typeof matchFactorSchema>;
export type MatchReasoning = z.infer<typeof matchReasoningSchema>;
export type JobMatchResult = z.infer<typeof jobMatchSchema>;
