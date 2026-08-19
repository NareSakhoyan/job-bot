import type { JobSearchQuery, RawJob } from "@job-bot/shared";

/**
 * Every job source implements exactly this. Adapters own their own transport,
 * auth and pagination; everything downstream sees only RawJob[].
 */
export interface JobSource {
  /** Stable identifier persisted on JobSighting.source. */
  readonly id: string;
  readonly displayName: string;
  /**
   * Whether one run returns everything the source currently lists.
   *
   * Staleness detection rests on this. A company board returns its whole
   * catalogue, so a posting missing from a run has genuinely been taken down.
   * An aggregator feed returns a rolling window ordered by recency, where
   * absence means "older than the window" — closing those would mark most of
   * the catalogue dead on every run and reopen it the moment it resurfaced.
   */
  readonly returnsFullCatalogue: boolean;
  search(query: JobSearchQuery): Promise<RawJob[]>;
}
