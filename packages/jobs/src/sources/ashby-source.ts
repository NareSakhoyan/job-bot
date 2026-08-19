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

const logger = createLogger("source.ashby");

/**
 * Ashby's posting API is public and documented. Unlike the others it does
 * publish structured compensation on some postings, so salary survives when a
 * company chooses to disclose it.
 */
const BOARD_URL = (board: string) =>
  `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;

const compensationSchema = z
  .object({
    compensationTierSummary: z.string().nullish(),
    summaryComponents: z
      .array(
        z.object({
          compensationType: z.string().nullish(),
          currencyCode: z.string().nullish(),
          minValue: z.number().nullish(),
          maxValue: z.number().nullish(),
        }),
      )
      .nullish(),
  })
  .nullish();

const ashbyJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.string().nullish(),
  isRemote: z.boolean().nullish(),
  employmentType: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  descriptionHtml: z.string().nullish(),
  jobUrl: z.string().url(),
  publishedAt: z.string().nullish(),
  compensation: compensationSchema,
});

const ashbyResponseSchema = z.object({ jobs: z.array(ashbyJobSchema) });

export interface AshbyBoard {
  /** The board name in the URL, e.g. "linear". */
  board: string;
  company: string;
}

/** Reads a salary range only when the board publishes one in a usable form. */
const readSalary = (compensation: z.infer<typeof compensationSchema>): RawJob["salary"] => {
  const salaryComponent = (compensation?.summaryComponents ?? []).find(
    (component) => (component.compensationType ?? "").toLowerCase() === "salary",
  );

  if (!salaryComponent) return null;

  const min = salaryComponent.minValue ?? null;
  const max = salaryComponent.maxValue ?? null;
  if (min === null && max === null) return null;

  return {
    min: min === null ? null : Math.round(min),
    max: max === null ? null : Math.round(max),
    currency: salaryComponent.currencyCode ?? "USD",
    period: "YEAR",
  };
};

export class AshbyJobSource implements JobSource {
  readonly id = "ashby";
  readonly displayName = "Ashby job boards";
  readonly returnsFullCatalogue = true;

  constructor(
    private readonly boards: AshbyBoard[],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: JobSearchQuery): Promise<RawJob[]> {
    const collected: RawJob[] = [];

    for (const board of this.boards) {
      try {
        collected.push(...(await this.fetchBoard(board)));
      } catch (error) {
        logger.warn("Board could not be read", {
          board: board.board,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return collected.filter((job) => matchesQuery(job, query)).slice(0, query.limit);
  }

  private async fetchBoard(board: AshbyBoard): Promise<RawJob[]> {
    const response = await this.fetchImpl(BOARD_URL(board.board), {
      headers: { accept: "application/json" },
    });

    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    const parsed = ashbyResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`Unexpected payload: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    }

    logger.info("Board read", { board: board.board, jobs: parsed.data.jobs.length });

    return parsed.data.jobs.map((job) => {
      const description = job.descriptionPlain?.trim() || stripHtml(job.descriptionHtml ?? "");
      const location = job.location?.trim() || "Not specified";

      return {
        source: this.id,
        externalId: `${board.board}:${job.id}`,
        url: job.jobUrl,
        company: board.company,
        title: job.title.trim(),
        location,
        isRemote: resolveIsRemote({ sourceFlag: job.isRemote, location, title: job.title }),
        employmentType:
          normalizeEmploymentType(job.employmentType) ??
          inferEmploymentType(job.title, description),
        salary: readSalary(job.compensation),
        description: description.length > 0 ? description : job.title,
        requirements: extractRequirements(description),
        responsibilities: [],
        technologies: extractTechnologies(description),
        postedAt: job.publishedAt ? new Date(job.publishedAt).toISOString() : null,
      } satisfies RawJob;
    });
  }
}
