import type { MatchJob, MatchProfile } from "@job-bot/shared";
import { normalizeText } from "@job-bot/jobs";
import { SKILL_LEVEL_WEIGHT, UNRATED_EXPERIENCE_WEIGHT } from "../weights";
import type { FactorOutcome } from "../types";

export interface SkillAssessment extends FactorOutcome {
  matched: string[];
  missing: string[];
}

/**
 * Scores the job's technology list against the profile. A technology counts
 * fully only if it is a rated skill at expert level; anything used in a real
 * role but never self-rated counts partially. A job that lists no technologies
 * cannot be assessed on this factor.
 */
export const scoreSkills = (profile: MatchProfile, job: MatchJob): SkillAssessment => {
  if (job.technologies.length === 0) {
    return {
      applicable: false,
      score: 0,
      detail: "The posting lists no technologies.",
      matched: [],
      missing: [],
    };
  }

  const ratedByName = new Map(
    profile.skills.map((skill) => [normalizeText(skill.name), skill.level]),
  );
  const experienceTech = new Set(profile.experienceTechnologies.map(normalizeText));

  const matched: string[] = [];
  const missing: string[] = [];
  let earned = 0;

  for (const technology of job.technologies) {
    const key = normalizeText(technology);
    const level = ratedByName.get(key);

    if (level) {
      earned += SKILL_LEVEL_WEIGHT[level];
      matched.push(technology);
      continue;
    }

    if (experienceTech.has(key)) {
      earned += UNRATED_EXPERIENCE_WEIGHT;
      matched.push(technology);
      continue;
    }

    missing.push(technology);
  }

  const score = Math.round((earned / job.technologies.length) * 100);

  return {
    applicable: true,
    score: Math.min(100, score),
    detail: `${matched.length} of ${job.technologies.length} listed technologies are recorded in the profile.`,
    matched,
    missing,
  };
};
