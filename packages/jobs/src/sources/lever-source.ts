import { z } from "zod";
import { createLogger, type JobSearchQuery, type RawJob } from "@job-bot/shared";
import {
  resolveIsRemote,
  extractRequirements,
  extractTechnologies,
  inferEmploymentType,
  matchesQuery,
  normalizeEmploymentType,
  stripHtml,
} from "./posting-parsing";
import type { JobSource } from "../types";

const logger = createLogger("source.lever");

/**
 * Lever publishes each customer's postings as public JSON. Like Greenhouse it
 * is documented and unauthenticated, and like Greenhouse it is per-company —
 * a watchlist, not a search engine.
 */
const POSTINGS_URL = (company: string) =>
  `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`;

const leverPostingSchema = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string().url(),
  createdAt: z.number().optional(),
  workplaceType: z.string().nullish(),
  descriptionPlain: z.string().optional(),
  description: z.string().optional(),
  categories: z
    .object({
      commitment: z.string().nullish(),
      location: z.string().nullish(),
      team: z.string().nullish(),
    })
    .nullish(),
  lists: z
    .array(z.object({ text: z.string(), content: z.string() }))
    .nullish(),
});

export interface LeverCompany {
  /** The token in the postings URL, e.g. "netlify". */
  company: string;
  /** How the employer should be recorded. */
  name: string;
}

export class LeverJobSource implements JobSource {
  readonly id = "lever";
  readonly displayName = "Lever job boards";
  readonly returnsFullCatalogue = true;

  constructor(
    private readonly companies: LeverCompany[],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: JobSearchQuery): Promise<RawJob[]> {
    const collected: RawJob[] = [];

    for (const company of this.companies) {
      try {
        collected.push(...(await this.fetchCompany(company)));
      } catch (error) {
        logger.warn("Postings could not be read", {
          company: company.company,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return collected.filter((job) => matchesQuery(job, query)).slice(0, query.limit);
  }

  private async fetchCompany(company: LeverCompany): Promise<RawJob[]> {
    const response = await this.fetchImpl(POSTINGS_URL(company.company), {
      headers: { accept: "application/json" },
    });

    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    const parsed = z.array(leverPostingSchema).safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`Unexpected payload: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    }

    logger.info("Postings read", { company: company.company, jobs: parsed.data.length });

    return parsed.data.map((posting) => {
      // Lever splits requirements into named lists; fold them into the body.
      const listText = (posting.lists ?? [])
        .map((list) => `${list.text}\n${stripHtml(list.content)}`)
        .join("\n\n");
      const description = [
        posting.descriptionPlain ?? stripHtml(posting.description ?? ""),
        listText,
      ]
        .filter((part) => part.trim().length > 0)
        .join("\n\n");

      const location = posting.categories?.location?.trim() || "Not specified";
      const workplace = posting.workplaceType ?? "";

      return {
        source: this.id,
        externalId: `${company.company}:${posting.id}`,
        url: posting.hostedUrl,
        company: company.name,
        title: posting.text.trim(),
        location,
        isRemote: resolveIsRemote({
          sourceFlag: workplace.toLowerCase() === "remote",
          location,
          title: posting.text,
        }),
        employmentType:
          normalizeEmploymentType(posting.categories?.commitment) ??
          inferEmploymentType(posting.text, description),
        // Lever does not publish a structured salary field.
        salary: null,
        description: description.length > 0 ? description : posting.text,
        requirements: extractRequirements(description),
        responsibilities: [],
        technologies: extractTechnologies(description),
        postedAt: posting.createdAt ? new Date(posting.createdAt).toISOString() : null,
      } satisfies RawJob;
    });
  }
}
