import type { Prisma } from "@prisma/client";
import type { JobMatchResult } from "@job-bot/shared";
import { prisma } from "../client";

/**
 * Writes the current match for a (profile, job) pair. There is exactly one,
 * so re-running the matcher replaces it and the operation is idempotent.
 */
export const saveJobMatch = async (profileId: string, jobId: string, result: JobMatchResult) => {
  const data = {
    score: Math.round(result.score),
    deterministicScore: Math.round(result.deterministicScore),
    recommendation: result.recommendation,
    factors: result.factors as unknown as Prisma.InputJsonValue,
    matchingSkills: result.matchingSkills,
    missingSkills: result.missingSkills,
    concerns: result.concerns,
    reasoning: result.reasoning,
    confidence: result.confidence,
    modelVersion: result.modelVersion,
  };

  return prisma.jobMatch.upsert({
    where: { profileId_jobId: { profileId, jobId } },
    create: { profileId, jobId, ...data },
    update: data,
  });
};

/**
 * Jobs to score for a profile. Without `includeScored`, only jobs this profile
 * has no match for are returned.
 */
export const listJobsForMatching = async (
  profileId: string,
  options: { includeScored?: boolean } = {},
) =>
  prisma.job.findMany({
    // A closed posting cannot be applied to, so scoring it wastes model calls
    // and puts dead jobs at the top of a shortlist.
    where: options.includeScored
      ? { closedAt: null }
      : { closedAt: null, matches: { none: { profileId } } },
    orderBy: { discoveredAt: "desc" },
  });

export type MatchableJob = Awaited<ReturnType<typeof listJobsForMatching>>[number];
