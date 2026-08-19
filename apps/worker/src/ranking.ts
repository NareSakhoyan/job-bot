/** The shape ranking needs: an application carrying its own profile's match. */
export interface RankableApplication {
  job: { matches: Array<{ score: number }> };
}

/** An application with no recorded match sorts below every scored one. */
const matchScore = (application: RankableApplication): number =>
  application.job.matches[0]?.score ?? -1;

/**
 * Orders applications by match score, strongest first.
 *
 * Preparation spends model calls on whatever it selects, so the selection has
 * to be the strongest matches. Ordering by `updatedAt` — which is what the
 * query did — spent that budget on whichever rows happened to be touched last,
 * which is close to arbitrary once a scoring run has updated them all.
 *
 * Sorting here rather than in the query because a match score lives on a
 * related row; Prisma cannot order by it, and the candidate set above the
 * score floor is small enough that ordering in memory costs nothing.
 */
export const rankByMatchScore = <T extends RankableApplication>(applications: T[]): T[] =>
  [...applications].sort((a, b) => matchScore(b) - matchScore(a));
