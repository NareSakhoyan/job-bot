import { z } from "zod";
import { createLogger, type JobSearchQuery, type RawJob } from "@job-bot/shared";
import {
  extractTechnologies,
  matchesQuery,
  normalizeEmploymentType,
  stripHtml,
} from "./posting-parsing";
import type { JobSource } from "../types";

const logger = createLogger("source.staffam");

/**
 * staff.am — the job board Armenian employers actually use.
 *
 * Added because the catalogue was blind to the candidate's own country: of
 * 3,200 postings gathered from international boards, not one mentioned Armenia
 * or Yerevan. Armenian employers overwhelmingly do not use Greenhouse, Ashby
 * or Lever, so no amount of curating those reaches them. Roles here are the
 * only ones where on-site and hybrid are fully open rather than blocked on a
 * visa.
 *
 * The site is a Next.js app whose listing data is served as JSON at a path
 * containing the current build id. That id changes on every deploy, so it is
 * discovered at run time from the page itself rather than hardcoded — a
 * pinned id would work until staff.am next shipped, then silently return 404
 * forever.
 */
const SITE = "https://staff.am";
const LISTING_PAGE = `${SITE}/en/jobs`;
const dataUrl = (buildId: string, page: number) =>
  `${SITE}/_next/data/${buildId}/en/jobs.json?page=${page}`;
/** Detail lives under the job's category, which the listing already gives us. */
const detailUrl = (buildId: string, category: string, slug: string) =>
  `${SITE}/_next/data/${buildId}/en/jobs/${category}/${slug}.json`;

/** A polite, honest identifier; the endpoint rejects an empty agent. */
const USER_AGENT = "job-bot (personal job search; contact via repository)";

/** staff.am labels everything in three languages; English when present. */
const localized = z
  .object({ en: z.string().nullish(), am: z.string().nullish(), ru: z.string().nullish() })
  .nullish();

const pick = (value: { en?: string | null; am?: string | null; ru?: string | null } | null | undefined) =>
  value?.en?.trim() || value?.am?.trim() || value?.ru?.trim() || "";

const staffJobSchema = z.object({
  id: z.number(),
  title: localized,
  slug: localized,
  is_remote: z.union([z.boolean(), z.number()]).nullish(),
  job_city: z.object({ title: localized }).nullish(),
  category: z.object({ title: localized, code: z.string().nullish() }).nullish(),
  companiesStruct: z.object({ title: localized, slug: z.string().nullish() }).nullish(),
  deadline: z.string().nullish(),
  activated_at: z.record(z.string(), z.string()).nullish(),
});

const pageSchema = z.object({
  pageProps: z.object({ jobs: z.array(z.unknown()), totalCount: z.number().nullish() }),
});

const detailSchema = z.object({
  pageProps: z.object({
    job: z
      .object({
        description: localized,
        required_qualifications: localized,
        responsibilities: localized,
        skills: z.array(z.object({ title: localized })).nullish(),
        job_type: z.object({ title: localized }).nullish(),
        job_candidate_level: z.object({ title: localized }).nullish(),
      })
      .nullish(),
  }),
});

/** Splits an HTML list into the bullet strings the scorer expects. */
const bullets = (html: string): string[] =>
  html
    .split(/<\/li>/i)
    .map((part) => stripHtml(part).trim())
    .filter((part) => part.length > 2)
    .slice(0, 20);

export interface StaffAmOptions {
  /** Listing pages to read, 53 postings each. */
  pages?: number;
  /** Keep only postings the board marks remote. */
  remoteOnly?: boolean;
  /**
   * Category codes to keep. Empty means all.
   *
   * This board serves a whole national economy — the busiest categories are
   * sales and banking, and a courier vacancy is not a near miss for a software
   * engineer, it is a different universe. Matching can only say "I cannot
   * assess this" about a one-line Armenian-language posting with no
   * technologies in it, and an unassessable job outranking a real one is worse
   * than not ingesting it.
   *
   * Filtering in discovery is safe here for the same reason as the other feed
   * source: this is a recency window, not a catalogue, so nothing infers
   * closure from a posting's absence.
   */
  categories?: string[];
  /**
   * Fetch each posting's detail page for its description.
   *
   * The listing carries no body, and a posting with no description is
   * unassessable on technical fit — which caps it at the unassessable
   * ceiling and guarantees it can never outrank an international role,
   * however well it fits. One request per posting is the price of these
   * jobs competing honestly.
   */
  fetchDetails?: boolean;
}

const DEFAULT_PAGES = 6;

export class StaffAmJobSource implements JobSource {
  readonly id = "staffam";
  readonly displayName = "staff.am (Armenian job board)";
  /**
   * The listing is ordered by recency and read a few pages deep, so a posting
   * absent from a run is outside the window rather than taken down.
   */
  readonly returnsFullCatalogue = false;

  private readonly pages: number;
  private readonly remoteOnly: boolean;
  private readonly categories: Set<string>;
  private readonly fetchDetails: boolean;

  constructor(
    options: StaffAmOptions = {},
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.pages = Math.max(1, options.pages ?? DEFAULT_PAGES);
    this.remoteOnly = options.remoteOnly ?? false;
    this.categories = new Set(options.categories ?? []);
    this.fetchDetails = options.fetchDetails ?? false;
  }

  async search(query: JobSearchQuery): Promise<RawJob[]> {
    const buildId = await this.discoverBuildId();
    if (buildId === null) {
      logger.warn("Could not read the site's build id; skipping this source");
      return [];
    }

    const collected: RawJob[] = [];
    for (let page = 1; page <= this.pages; page += 1) {
      try {
        const jobs = await this.fetchPage(buildId, page);
        if (jobs.length === 0) break;
        collected.push(...jobs);
      } catch (error) {
        logger.warn("Listing page could not be read", {
          page,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }

    logger.info("Listing read", { pages: this.pages, collected: collected.length });
    return collected.filter((job) => matchesQuery(job, query)).slice(0, query.limit);
  }

  /** Reads the current build id out of the listing page's embedded state. */
  private async discoverBuildId(): Promise<string | null> {
    const response = await this.fetchImpl(LISTING_PAGE, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) return null;

    const html = await response.text();
    return /"buildId"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? null;
  }

  private async fetchPage(buildId: string, page: number): Promise<RawJob[]> {
    const response = await this.fetchImpl(dataUrl(buildId, page), {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
    });
    if (!response.ok) throw new Error(`staff.am returned ${response.status} for page ${page}`);

    const parsed = pageSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error(`staff.am page ${page} did not match the expected shape`);

    let skipped = 0;
    const jobs = parsed.data.pageProps.jobs.flatMap((raw) => {
      const candidate = staffJobSchema.safeParse(raw);
      if (!candidate.success) {
        skipped += 1;
        return [];
      }

      const entry = candidate.data;
      const title = pick(entry.title);
      const company = pick(entry.companiesStruct?.title);
      const slug = pick(entry.slug);
      if (title.length === 0 || company.length === 0 || slug.length === 0) {
        skipped += 1;
        return [];
      }

      const isRemote = entry.is_remote === true || entry.is_remote === 1;
      if (this.remoteOnly && !isRemote) return [];

      const code = entry.category?.code ?? "";
      if (this.categories.size > 0 && !this.categories.has(code)) return [];

      const city = pick(entry.job_city?.title) || "Yerevan";
      const category = pick(entry.category?.title);
      // The listing carries no description; the title, category and employer
      // are what this source can honestly assert. Matching reads a thin
      // posting as unassessable rather than as a poor fit.
      const description = [
        `${title} at ${company}.`,
        category.length > 0 ? `Category: ${category}.` : "",
        `Location: ${city}, Armenia${isRemote ? " (remote)" : ""}.`,
      ]
        .filter((part) => part.length > 0)
        .join(" ");

      return [
        {
          source: this.id,
          externalId: String(entry.id),
          // The canonical path includes the category; /en/job/<slug> only
          // redirects there, and a stored URL should not depend on a redirect.
          url: code.length > 0 ? `${SITE}/en/jobs/${code}/${slug}` : `${SITE}/en/job/${slug}`,
          company,
          title,
          // Naming the country explicitly is what lets work-eligibility see
          // that this is a job the candidate can actually take.
          location: isRemote ? `Remote - Armenia` : `${city}, Armenia`,
          isRemote,
          employmentType: null,
          salary: null,
          description,
          requirements: [],
          responsibilities: [],
          technologies: extractTechnologies(`${title} ${category}`),
          postedAt: null,
        } satisfies RawJob,
      ];
    });

    if (skipped > 0) logger.info("Listing entries skipped", { page, skipped });
    if (!this.fetchDetails) return jobs;

    const enriched: RawJob[] = [];
    for (const job of jobs) {
      enriched.push(await this.withDetail(buildId, job));
    }
    return enriched;
  }

  /**
   * Adds the posting's body, requirements and stated level.
   *
   * A failure here degrades to the listing-only job rather than dropping it:
   * a thin posting still beats no posting, and the scorer already reports
   * unassessable technical fit honestly.
   */
  private async withDetail(buildId: string, job: RawJob): Promise<RawJob> {
    const path = job.url.replace(`${SITE}/en/jobs/`, "");
    const [category, slug] = path.split("/");
    if (!category || !slug) return job;

    try {
      const response = await this.fetchImpl(detailUrl(buildId, category, slug), {
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
      });
      if (!response.ok) return job;

      const parsed = detailSchema.safeParse(await response.json());
      const detail = parsed.success ? parsed.data.pageProps.job : null;
      if (!detail) return job;

      const body = pick(detail.description);
      const qualifications = pick(detail.required_qualifications);
      const duties = pick(detail.responsibilities);
      const skills = (detail.skills ?? []).map((skill) => pick(skill.title)).filter((s) => s.length > 0);
      const level = pick(detail.job_candidate_level?.title);

      const text = [stripHtml(body), stripHtml(qualifications), stripHtml(duties)]
        .filter((part) => part.trim().length > 0)
        .join("\n\n");
      if (text.trim().length === 0) return job;

      return {
        ...job,
        // Level is prepended so seniority can be read from a title that often
        // omits it — the board carries the level as its own field instead.
        title: level.length > 0 && !new RegExp(level, "i").test(job.title) ? `${level} ${job.title}` : job.title,
        description: [body, qualifications, duties].filter((p) => p.length > 0).join("\n"),
        requirements: bullets(qualifications),
        responsibilities: bullets(duties),
        technologies: extractTechnologies(`${job.title} ${text} ${skills.join(" ")}`),
        employmentType: normalizeEmploymentType(pick(detail.job_type?.title)),
      };
    } catch {
      return job;
    }
  }
}
