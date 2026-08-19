import type { MatchJob, MatchProfile } from "@job-bot/shared";
import type { FactorOutcome } from "../types";

/**
 * Compares the posting's range against the stated expectation. Both a missing
 * expectation and a missing published range make this factor inapplicable —
 * a job is never penalised for withholding its range.
 */
export const scoreSalary = (profile: MatchProfile, job: MatchJob): FactorOutcome => {
  if (profile.salaryMin === null && profile.salaryMax === null) {
    return { applicable: false, score: 0, detail: "No salary expectation recorded." };
  }

  if (job.salaryMin === null && job.salaryMax === null) {
    return { applicable: false, score: 0, detail: "The posting publishes no salary range." };
  }

  // Currencies are not converted; comparing across them would be guesswork.
  if (job.salaryCurrency !== null && job.salaryCurrency !== profile.salaryCurrency) {
    return {
      applicable: false,
      score: 0,
      detail: `Posting is in ${job.salaryCurrency}, expectation in ${profile.salaryCurrency}; not comparable.`,
    };
  }

  if (job.salaryPeriod !== null && job.salaryPeriod !== profile.salaryPeriod) {
    return {
      applicable: false,
      score: 0,
      detail: `Posting is per ${job.salaryPeriod.toLowerCase()}, expectation per ${profile.salaryPeriod.toLowerCase()}; not comparable.`,
    };
  }

  const jobCeiling = (job.salaryMax ?? job.salaryMin) as number;
  const jobFloor = (job.salaryMin ?? job.salaryMax) as number;
  const wanted = profile.salaryMin ?? profile.salaryMax ?? 0;

  if (jobCeiling >= (profile.salaryMax ?? wanted)) {
    return { applicable: true, score: 100, detail: "The posting reaches the top of the expectation." };
  }

  if (jobCeiling >= wanted) {
    return { applicable: true, score: 80, detail: "The posting meets the minimum expectation." };
  }

  const shortfallRatio = jobCeiling / Math.max(wanted, 1);
  return {
    applicable: true,
    score: Math.max(0, Math.round(shortfallRatio * 70)),
    detail: `The posting tops out at ${jobCeiling}, below the ${wanted} minimum (floor ${jobFloor}).`,
  };
};
