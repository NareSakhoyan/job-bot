import { z } from "zod";
import { createLogger, type JobSearchQuery, type RawJob } from "@job-bot/shared";
import {
  extractRequirements,
  extractTechnologies,
  matchesQuery,
  normalizeEmploymentType,
  stripHtml,
} from "./posting-parsing";
import type { JobSource } from "../types";

const logger = createLogger("source.arbeitnow");

/**
 * Arbeitnow aggregates European postings — overwhelmingly Germany and the
 * surrounding market — as a free, unauthenticated feed.
 *
 * It is the first source that is not a company watchlist, and it behaves
 * differently in one way that matters: the feed is a rolling window ordered by
 * recency with no last page, so a run sees the newest N pages rather than
 * everything listed. That is why `returnsFullCatalogue` is false — absence
 * from a run says nothing about whether a posting is still open.
 *
 * Most of what it returns is on-site and German-language, and most of that
 * will score zero on work eligibility. That is the intended division of
 * labour: discovery says what exists, matching decides what is reachable.
 */
const FEED_URL = (page: number) => `https://www.arbeitnow.com/api/job-board-api?page=${page}`;

/** The canonical posting page. The feed's own `url` is often just the
 *  employer's homepage, which is no use for applying. */
const postingUrl = (slug: string) => `https://www.arbeitnow.com/view/${slug}`;

/**
 * The feed serialises an empty list as `{}` for some records, so a field that
 * is documented as an array of strings arrives as an object. Accept both and
 * normalise, rather than losing the record over a serialisation quirk.
 */
const stringList = z
  .union([z.array(z.string()), z.record(z.string(), z.unknown())])
  .nullish()
  .transform((value) => (Array.isArray(value) ? value : []));

const arbeitnowJobSchema = z.object({
  slug: z.string().min(1),
  company_name: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  remote: z.boolean().nullish(),
  location: z.string().nullish(),
  tags: stringList,
  job_types: stringList,
  created_at: z.number().nullish(),
});

/**
 * The envelope is validated; the entries deliberately are not.
 *
 * An aggregator carries records from thousands of employers and some will
 * always be malformed. Validating the page as a whole means one bad record
 * costs every good one on it — which is exactly what happened the first time
 * this ran against the live feed: three entries with an object-shaped
 * `job_types` discarded all 176.
 */
const feedSchema = z.object({ data: z.array(z.unknown()) });

export interface ArbeitnowOptions {
  /**
   * Pages of the rolling feed to read per run, ~175 postings each. Bounded
   * because the feed has no end; raising it deepens history at a linear cost
   * in requests and stored rows.
   */
  pages?: number;
  /**
   * Keep only postings the feed marks remote.
   *
   * Filtering in discovery is normally forbidden here, because a posting
   * missing from a run must mean "taken down" rather than "did not match a
   * filter" — otherwise staleness detection closes live jobs. That rule binds
   * catalogue sources. This feed is a rolling window and already declares
   * `returnsFullCatalogue: false`, so nothing infers closure from its silence
   * and filtering costs nothing.
   *
   * It earns its place on yield: on-site German postings are 90% of this feed
   * and essentially none of them are reachable for a remote-only candidate.
   */
  remoteOnly?: boolean;
}

const DEFAULT_PAGES = 5;

/**
 * The aggregator appends its own advertising to posting bodies. It is chrome,
 * not job content, and leaving it in lets a posting with no description at all
 * look like a posting with one.
 */
const AGGREGATOR_PROMO = /find more [^.\n]*jobs[^.\n]*on arbeitnow/gi;

/**
 * The least description a posting can carry and still be worth storing.
 *
 * Set well below the tenth percentile of real postings (~1,500 characters), so
 * it removes only genuine stubs. Without it a posting whose entire body is the
 * aggregator's own advert still matches on a stray technology token — which is
 * exactly how a content-free listing reached the top of a shortlist.
 */
const MIN_DESCRIPTION_CHARS = 200;

export class ArbeitnowJobSource implements JobSource {
  readonly id = "arbeitnow";
  readonly displayName = "Arbeitnow (European job feed)";
  readonly returnsFullCatalogue = false;

  private readonly pages: number;
  private readonly remoteOnly: boolean;

  constructor(
    options: ArbeitnowOptions = {},
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.pages = Math.max(1, options.pages ?? DEFAULT_PAGES);
    this.remoteOnly = options.remoteOnly ?? false;
  }

  async search(query: JobSearchQuery): Promise<RawJob[]> {
    const collected: RawJob[] = [];

    for (let page = 1; page <= this.pages; page += 1) {
      try {
        const jobs = await this.fetchPage(page);
        // A short page means the feed ran out; stop rather than spin.
        if (jobs.length === 0) break;
        collected.push(...jobs);
      } catch (error) {
        logger.warn("Feed page could not be read", {
          page,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }

    logger.info("Feed read", { pages: this.pages, collected: collected.length });
    return collected.filter((job) => matchesQuery(job, query)).slice(0, query.limit);
  }

  private async fetchPage(page: number): Promise<RawJob[]> {
    const response = await this.fetchImpl(FEED_URL(page), {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Arbeitnow returned ${response.status} for page ${page}`);
    }

    const parsed = feedSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`Arbeitnow page ${page} did not match the expected shape`);
    }

    let skipped = 0;
    let thin = 0;
    let onsite = 0;
    const jobs = parsed.data.data.flatMap((raw) => {
      const candidate = arbeitnowJobSchema.safeParse(raw);
      if (!candidate.success) {
        skipped += 1;
        return [];
      }
      const entry = candidate.data;
      if (this.remoteOnly && entry.remote !== true) {
        onsite += 1;
        return [];
      }
      const description = entry.description.trim();
      const text = stripHtml(description).replace(AGGREGATOR_PROMO, " ").replace(/\s+/g, " ").trim();

      // A posting that is all chrome and no content cannot be scored honestly
      // or drafted against, and storing it only pollutes the shortlist.
      if (text.length < MIN_DESCRIPTION_CHARS) {
        thin += 1;
        return [];
      }
      const isRemote = entry.remote === true;
      const location = entry.location?.trim() || (isRemote ? "Remote" : "Not stated");

      return [
        {
          source: this.id,
          externalId: entry.slug,
          url: postingUrl(entry.slug),
          company: entry.company_name.trim(),
          title: entry.title.trim(),
          location: isRemote && !/remote/i.test(location) ? `Remote - ${location}` : location,
          isRemote,
          employmentType: normalizeEmploymentType(entry.job_types[0] ?? null),
          salary: null,
          description: description.replace(AGGREGATOR_PROMO, " ").trim(),
          requirements: extractRequirements(text),
          responsibilities: [],
          technologies: extractTechnologies(`${entry.title} ${text} ${entry.tags.join(" ")}`),
          postedAt: entry.created_at ? new Date(entry.created_at * 1000).toISOString() : null,
        } satisfies RawJob,
      ];
    });

    if (skipped > 0) logger.warn("Feed entries skipped as malformed", { page, skipped });
    if (thin > 0) logger.info("Feed entries skipped as content-free", { page, thin });
    if (onsite > 0) logger.info("Feed entries skipped as not remote", { page, onsite });
    return jobs;
  }
}
