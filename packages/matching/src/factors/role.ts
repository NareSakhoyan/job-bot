import type { MatchJob, MatchProfile } from "@job-bot/shared";
import { normalizeTitle } from "@job-bot/jobs";
import type { FactorOutcome } from "../types";

/** Words that appear in almost every title and carry no signal. */
const STOP_WORDS = new Set(["engineer", "developer", "software", "of", "and", "the"]);

const meaningfulTokens = (title: string): Set<string> =>
  new Set(normalizeTitle(title).split(" ").filter((token) => token.length > 1));

/**
 * Compares the posting's title against every target role and keeps the best
 * fit. Tokens shared by nearly all engineering titles are down-weighted so
 * "Senior Backend Engineer" and "Senior Frontend Engineer" stay distinguishable.
 */
export const scoreRole = (profile: MatchProfile, job: MatchJob): FactorOutcome => {
  if (profile.targetRoles.length === 0) {
    return { applicable: false, score: 0, detail: "No target roles recorded." };
  }

  const jobTokens = meaningfulTokens(job.title);
  if (jobTokens.size === 0) {
    return { applicable: false, score: 0, detail: "Job title could not be parsed." };
  }

  let best = 0;
  let bestRole = profile.targetRoles[0] ?? "";

  for (const role of profile.targetRoles) {
    const roleTokens = meaningfulTokens(role);
    if (roleTokens.size === 0) continue;

    let weightedOverlap = 0;
    let weightedTotal = 0;

    for (const token of roleTokens) {
      const weight = STOP_WORDS.has(token) ? 0.3 : 1;
      weightedTotal += weight;
      if (jobTokens.has(token)) weightedOverlap += weight;
    }

    const score = weightedTotal === 0 ? 0 : Math.round((weightedOverlap / weightedTotal) * 100);
    if (score > best) {
      best = score;
      bestRole = role;
    }
  }

  return {
    applicable: true,
    score: best,
    detail:
      best === 0
        ? `"${job.title}" does not overlap with any target role.`
        : `Closest target role is "${bestRole}".`,
  };
};
