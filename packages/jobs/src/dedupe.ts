import { createHash } from "node:crypto";
import type { NormalizedJob, RawJob } from "@job-bot/shared";
import {
  normalizeCompany,
  normalizeDescription,
  normalizeLocationBucket,
  normalizeTitle,
} from "./normalize";

/**
 * The identity of a posting, independent of which board reported it.
 * Two jobs sharing a dedupeKey are treated as the same opening.
 */
export const computeDedupeKey = (job: Pick<RawJob, "company" | "title" | "location" | "isRemote">): string => {
  const parts = [
    normalizeCompany(job.company),
    normalizeTitle(job.title),
    normalizeLocationBucket(job.location, job.isRemote),
  ];

  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
};

export const normalizeJob = (job: RawJob): NormalizedJob => ({
  ...job,
  dedupeKey: computeDedupeKey(job),
  descriptionText: normalizeDescription(job.description),
});

export interface DedupeResult {
  /** One entry per distinct posting, holding every sighting that produced it. */
  jobs: Array<{ job: NormalizedJob; duplicates: NormalizedJob[] }>;
  duplicateCount: number;
}

/**
 * Collapses a discovery batch in-memory. Persistence relies on the unique
 * index on Job.dedupeKey as the real guarantee; this keeps a single batch from
 * fighting itself and makes the collapse observable in logs.
 */
/**
 * Whether two postings can be the same opening.
 *
 * One source listing a posting twice under different ids means two different
 * openings — a company genuinely hiring several people for the same titled
 * role in the same place. Merging them loses real jobs, and the survivor's URL
 * then points at only one of them.
 */
const canMerge = (candidate: NormalizedJob, group: NormalizedJob[]): boolean =>
  !group.some(
    (member) => member.source === candidate.source && member.externalId !== candidate.externalId,
  );

/**
 * Collapses a discovery batch in-memory. Persistence relies on the unique
 * index on Job.dedupeKey as the real guarantee; this keeps a single batch from
 * fighting itself and makes the collapse observable in logs.
 *
 * Grouping is by dedupeKey *and* source agreement: cross-source duplicates
 * merge, same-source distinct postings never do.
 */
export const dedupeJobs = (jobs: RawJob[]): DedupeResult => {
  const groups = new Map<string, Array<{ job: NormalizedJob; duplicates: NormalizedJob[] }>>();
  let duplicateCount = 0;

  for (const raw of jobs) {
    const normalized = normalizeJob(raw);
    const candidates = groups.get(normalized.dedupeKey) ?? [];

    const target = candidates.find((entry) =>
      canMerge(normalized, [entry.job, ...entry.duplicates]),
    );

    if (!target) {
      candidates.push({ job: normalized, duplicates: [] });
      groups.set(normalized.dedupeKey, candidates);
      continue;
    }

    // An exact repeat of the same (source, externalId) is a true duplicate.
    const alreadySeen = [target.job, ...target.duplicates].some(
      (member) => member.source === normalized.source && member.externalId === normalized.externalId,
    );
    if (alreadySeen) {
      duplicateCount += 1;
      continue;
    }

    target.duplicates.push(normalized);
    duplicateCount += 1;
  }

  const entries = [...groups.values()].flat();

  // Distinct openings that share a dedupeKey need distinct persisted keys.
  for (const [index, entry] of entries.entries()) {
    const sameKey = entries.filter((other) => other.job.dedupeKey === entry.job.dedupeKey);
    if (sameKey.length > 1) {
      entry.job.dedupeKey = `${entry.job.dedupeKey}:${entry.job.source}:${entry.job.externalId}`;
      void index;
    }
  }

  return { jobs: entries, duplicateCount };
};
