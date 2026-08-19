import { prisma } from "@job-bot/database";
import { createLogger } from "@job-bot/shared";

const logger = createLogger("worker.purge");

/**
 * Removes every job that came from one source.
 *
 * Needed whenever a source is retired — most immediately, to clear the mock
 * fixtures out once real sources are configured, so invented companies stop
 * being ranked alongside real openings. Matches and applications for those
 * jobs go with them by cascade, which is correct: they describe a posting that
 * no longer exists.
 */
export const runPurge = async (source: string) => {
  const doomed = await prisma.job.findMany({
    where: { primarySource: source },
    select: { id: true, company: true },
  });

  if (doomed.length === 0) {
    logger.info("Nothing to purge", { source });
    return { source, removed: 0 };
  }

  const result = await prisma.job.deleteMany({ where: { primarySource: source } });

  logger.info("Source purged", {
    source,
    removed: result.count,
    companies: [...new Set(doomed.map((job) => job.company))].length,
  });

  return { source, removed: result.count };
};
