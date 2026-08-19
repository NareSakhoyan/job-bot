import { createLogger, jobSearchQuerySchema, type JobSearchQueryInput, type RawJob } from "@job-bot/shared";
import { dedupeJobs, type DedupeResult } from "./dedupe";
import type { JobSource } from "./types";

const logger = createLogger("discovery");

export interface DiscoveryOutcome extends DedupeResult {
  /** Per-source counts, before deduplication. */
  bySource: Record<string, number>;
  errors: Array<{ source: string; message: string }>;
}

/**
 * Runs a query across every configured source and collapses the results into
 * distinct postings. A failing source degrades the batch, it does not fail it.
 */
export const discoverJobs = async (
  sources: JobSource[],
  queryInput: JobSearchQueryInput = {},
): Promise<DiscoveryOutcome> => {
  const query = jobSearchQuerySchema.parse(queryInput);
  const collected: RawJob[] = [];
  const bySource: Record<string, number> = {};
  const errors: Array<{ source: string; message: string }> = [];

  for (const source of sources) {
    try {
      const jobs = await source.search(query);
      collected.push(...jobs);
      bySource[source.id] = jobs.length;
      logger.info("Source search completed", { source: source.id, found: jobs.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ source: source.id, message });
      bySource[source.id] = 0;
      logger.error("Source search failed", { source: source.id, error: message });
    }
  }

  const deduped = dedupeJobs(collected);
  logger.info("Discovery batch deduplicated", {
    collected: collected.length,
    distinct: deduped.jobs.length,
    duplicates: deduped.duplicateCount,
  });

  return { ...deduped, bySource, errors };
};
