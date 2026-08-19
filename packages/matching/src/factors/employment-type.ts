import type { MatchJob, MatchProfile } from "@job-bot/shared";
import type { FactorOutcome } from "../types";

export const scoreEmploymentType = (profile: MatchProfile, job: MatchJob): FactorOutcome => {
  if (job.employmentType === null) {
    return { applicable: false, score: 0, detail: "The posting states no employment type." };
  }

  if (profile.employmentTypes.length === 0) {
    return { applicable: false, score: 0, detail: "No employment-type preference recorded." };
  }

  const accepted = profile.employmentTypes.includes(job.employmentType);
  return {
    applicable: true,
    score: accepted ? 100 : 0,
    detail: accepted
      ? `${job.employmentType} is an accepted employment type.`
      : `${job.employmentType} is not among the accepted employment types.`,
  };
};
