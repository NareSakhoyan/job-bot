import { normalizeCompany, normalizeText } from "@job-bot/jobs";
import type { MatchFactor, MatchJob, MatchProfile, MatchRecommendation } from "@job-bot/shared";
import { scoreEmploymentType } from "./factors/employment-type";
import { detectSponsorshipConcern, scoreLocation } from "./factors/location";
import { scoreRole } from "./factors/role";
import { scoreSalary } from "./factors/salary";
import { scoreSeniority } from "./factors/seniority";
import { scoreSkills } from "./factors/skills";
import { scoreWorkEligibility } from "./factors/work-eligibility";
import type { FactorOutcome } from "./types";
import {
  BLOCKED_SCORE_CEILING,
  FACTOR_WEIGHTS,
  RECOMMENDATION_THRESHOLDS,
  SCORE_GATES,
  UNASSESSABLE_SKILLS_CEILING,
} from "./weights";

export interface DeterministicMatch {
  score: number;
  recommendation: MatchRecommendation;
  factors: MatchFactor[];
  matchingSkills: string[];
  missingSkills: string[];
  concerns: string[];
  /** Non-empty when a hard exclusion capped the score. */
  blockers: string[];
}

const recommendationFor = (score: number): MatchRecommendation => {
  const band = RECOMMENDATION_THRESHOLDS.find((entry) => score >= entry.min);
  return (band?.recommendation ?? "NOT_RECOMMENDED") as MatchRecommendation;
};

/**
 * Hard exclusions the candidate has stated. These cap the score rather than
 * silently hiding the job — the posting still appears, clearly marked.
 */
const findBlockers = (profile: MatchProfile, job: MatchJob): string[] => {
  const blockers: string[] = [];

  const company = normalizeCompany(job.company);
  if (profile.excludedCompanies.some((excluded) => normalizeCompany(excluded) === company)) {
    blockers.push(`${job.company} is on the excluded-companies list.`);
  }

  const jobTech = new Set(job.technologies.map(normalizeText));
  for (const excluded of profile.excludedTechnologies) {
    if (jobTech.has(normalizeText(excluded))) {
      blockers.push(`The posting requires ${excluded}, which is on the excluded-technologies list.`);
    }
  }

  return blockers;
};

/**
 * The deterministic half of the hybrid scorer, and the only thing that sets
 * the score. Weights of factors that cannot be assessed are redistributed
 * across the rest, so a posting is never punished for missing data.
 */
export const scoreMatch = (profile: MatchProfile, job: MatchJob): DeterministicMatch => {
  const skills = scoreSkills(profile, job);

  const outcomes: Array<[MatchFactor["factor"], FactorOutcome]> = [
    ["TECHNICAL_SKILLS", skills],
    ["ROLE", scoreRole(profile, job)],
    ["SENIORITY", scoreSeniority(profile, job)],
    ["LOCATION", scoreLocation(profile, job)],
    ["WORK_ELIGIBILITY", scoreWorkEligibility(profile, job)],
    ["SALARY", scoreSalary(profile, job)],
    ["EMPLOYMENT_TYPE", scoreEmploymentType(profile, job)],
  ];

  const applicableWeight = outcomes
    .filter(([, outcome]) => outcome.applicable)
    .reduce((total, [name]) => total + FACTOR_WEIGHTS[name], 0);

  const factors: MatchFactor[] = outcomes.map(([name, outcome]) => ({
    factor: name,
    score: outcome.score,
    weight: outcome.applicable && applicableWeight > 0 ? FACTOR_WEIGHTS[name] / applicableWeight : 0,
    detail: outcome.detail,
  }));

  const weighted = factors.reduce((total, factor) => total + factor.score * factor.weight, 0);
  const rawScore = applicableWeight === 0 ? 0 : Math.round(weighted);

  const blockers = findBlockers(profile, job);
  const concerns = [...blockers];

  // Gates cap the total for dealbreaker factors, then exclusions cap it again.
  let score = rawScore;

  if (!skills.applicable) {
    score = Math.min(score, UNASSESSABLE_SKILLS_CEILING);
    concerns.push(
      "Technical fit could not be assessed: the posting lists no recognisable technologies, so this score rests on title, location and employment type alone.",
    );
  }
  for (const gate of SCORE_GATES) {
    const outcome = outcomes.find(([name]) => name === gate.factor)?.[1];
    if (!outcome?.applicable || outcome.score >= gate.threshold) continue;

    score = Math.min(score, gate.ceiling);
    concerns.push(`${gate.concern} ${outcome.detail}`);
  }

  if (blockers.length > 0) score = Math.min(score, BLOCKED_SCORE_CEILING);
  const sponsorship = detectSponsorshipConcern(profile, job);
  if (sponsorship) concerns.push(sponsorship);

  for (const factor of factors) {
    if (factor.weight > 0 && factor.score < 40) concerns.push(factor.detail);
  }

  return {
    score,
    recommendation: blockers.length > 0 ? "NOT_RECOMMENDED" : recommendationFor(score),
    factors,
    matchingSkills: skills.matched,
    missingSkills: skills.missing,
    concerns: [...new Set(concerns)],
    blockers,
  };
};
