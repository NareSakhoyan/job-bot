import type { MatchFactor } from "@job-bot/shared";

export type FactorName = MatchFactor["factor"];

/**
 * Base weights, summing to 1. When a factor cannot be assessed — a posting
 * with no published salary, no stated employment type — its weight is
 * redistributed across the remaining factors rather than scoring it zero.
 * Absence of data must never look like a bad match.
 */
export const FACTOR_WEIGHTS: Record<FactorName, number> = {
  TECHNICAL_SKILLS: 0.3,
  WORK_ELIGIBILITY: 0.18,
  ROLE: 0.18,
  SENIORITY: 0.13,
  LOCATION: 0.09,
  SALARY: 0.08,
  EMPLOYMENT_TYPE: 0.04,
};

/** How much a skill counts toward the technical match, by recorded level. */
export const SKILL_LEVEL_WEIGHT = {
  EXPERT: 1,
  ADVANCED: 0.85,
  INTERMEDIATE: 0.6,
  BEGINNER: 0.35,
} as const;

/**
 * Weight for a technology used in a real role but not self-rated as a skill.
 * Deliberately mid-range: it is genuine exposure, but unrated.
 */
export const UNRATED_EXPERIENCE_WEIGHT = 0.6;

export const RECOMMENDATION_THRESHOLDS = [
  { min: 80, recommendation: "STRONG_MATCH" },
  { min: 65, recommendation: "GOOD_MATCH" },
  { min: 45, recommendation: "POSSIBLE_MATCH" },
  { min: 25, recommendation: "WEAK_MATCH" },
  { min: 0, recommendation: "NOT_RECOMMENDED" },
] as const;

/** Score ceiling applied when a hard exclusion fires. */
export const BLOCKED_SCORE_CEILING = 15;

/**
 * Some factors are not really tradeable. A weighted average lets a strong
 * showing elsewhere paper over a dealbreaker — an unfamiliar stack, or an
 * on-site role for someone who only works remotely. A gate caps the total
 * score when such a factor scores near zero, so the job still appears but
 * cannot read as a strong match.
 *
 * Gates are declared here rather than special-cased in the scorer, so adding
 * one is a data change and the rule stays visible in one place.
 */
export interface ScoreGate {
  factor: FactorName;
  /** Below this factor score the gate fires. */
  threshold: number;
  /** The highest total score a gated job may reach. */
  ceiling: number;
  concern: string;
}

/**
 * When technical fit cannot be judged at all — a posting that lists no
 * recognisable technologies — the remaining factors are title, location and
 * employment type, and those alone will happily produce 100.
 *
 * Redistributing an unassessable factor's weight is right when the factor is
 * peripheral (an unpublished salary). It is wrong for the factor that carries
 * more weight than any other: the honest reading is "unknown", not "perfect".
 */
export const UNASSESSABLE_SKILLS_CEILING = 55;

export const SCORE_GATES: readonly ScoreGate[] = [
  {
    factor: "TECHNICAL_SKILLS",
    threshold: 20,
    ceiling: 35,
    concern: "Almost none of the posting's technologies are recorded in the profile.",
  },
  {
    factor: "LOCATION",
    threshold: 20,
    ceiling: 40,
    concern: "The posting's location or work arrangement conflicts with the stated preference.",
  },
  {
    // When both skills and seniority are unassessable — a posting listing no
    // recognisable technology and no level — their weight redistributes onto
    // location and eligibility, and any remote posting drifts into the fifties
    // on those alone. That is how a consultant neurologist vacancy scored 54
    // against a software engineer. A title with nothing in common with any
    // target role is not a match at any other factor's price.
    factor: "ROLE",
    threshold: 20,
    ceiling: 25,
    concern: "The title has nothing in common with any target role.",
  },
  {
    factor: "SENIORITY",
    threshold: 25,
    ceiling: 45,
    concern: "The posting's level is out of reach for this profile.",
  },
  {
    // The hardest gate in the set, and deliberately harder than LOCATION:
    // a location mismatch is a preference not met, while an eligibility
    // mismatch means the application cannot succeed however good the fit.
    factor: "WORK_ELIGIBILITY",
    threshold: 25,
    ceiling: 20,
    concern: "The candidate could not take this job as advertised.",
  },
] as const;
