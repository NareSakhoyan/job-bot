import { z } from "zod";
import { createLogger, type EmploymentType, type JobSearchQuery, type RawJob } from "@job-bot/shared";
import {
  resolveIsRemote,
  extractRequirements,
  extractTechnologies,
  inferEmploymentType,
  matchesQuery,
  stripHtml,
} from "./posting-parsing";
import type { JobSource } from "../types";

const logger = createLogger("source.greenhouse");

/**
 * Greenhouse publishes each customer's board as public JSON. This is a
 * documented, unauthenticated endpoint intended for exactly this use — no
 * scraping, no HTML parsing, no evasion. The cost is that boards are
 * per-company, so this adapter takes a list of companies rather than a query.
 */
const BOARD_URL = (board: string) =>
  `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;

const greenhouseJobSchema = z.object({
  id: z.number(),
  title: z.string(),
  absolute_url: z.string().url(),
  updated_at: z.string().optional(),
  location: z.object({ name: z.string() }).nullish(),
  content: z.string().optional(),
  metadata: z.array(z.object({ name: z.string(), value: z.unknown() })).nullish(),
});

const greenhouseResponseSchema = z.object({ jobs: z.array(greenhouseJobSchema) });

export interface GreenhouseBoard {
  /** The board token in the URL, e.g. "stripe". */
  board: string;
  /** How the company should be recorded. */
  company: string;
}

/**
 * Reads public Greenhouse boards.
 *
 * The query filters client-side: the board endpoint returns a company's whole
 * list and offers no search parameters, so keyword and location filtering
 * happen here rather than at the source.
 */
export class GreenhouseJobSource implements JobSource {
  readonly id = "greenhouse";
  readonly displayName = "Greenhouse job boards";
  readonly returnsFullCatalogue = true;

  constructor(
    private readonly boards: GreenhouseBoard[],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: JobSearchQuery): Promise<RawJob[]> {
    const collected: RawJob[] = [];

    for (const board of this.boards) {
      try {
        const jobs = await this.fetchBoard(board);
        collected.push(...jobs);
      } catch (error) {
        // One unreachable board must not fail the whole run.
        logger.warn("Board could not be read", {
          board: board.board,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return collected.filter((job) => matchesQuery(job, query)).slice(0, query.limit);
  }

  private async fetchBoard(board: GreenhouseBoard): Promise<RawJob[]> {
    const response = await this.fetchImpl(BOARD_URL(board.board), {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const parsed = greenhouseResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`Unexpected board payload: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    }

    logger.info("Board read", { board: board.board, jobs: parsed.data.jobs.length });

    return parsed.data.jobs.map((job) => {
      const description = stripHtml(job.content ?? "");
      const location = job.location?.name?.trim() || "Not specified";

      return {
        source: this.id,
        externalId: `${board.board}:${job.id}`,
        url: job.absolute_url,
        company: board.company,
        title: job.title.trim(),
        location,
        isRemote: resolveIsRemote({ location, title: job.title }),
        employmentType: inferEmploymentType(job.title, description),
        // Greenhouse boards do not publish salary in a structured field.
        salary: null,
        description: description.length > 0 ? description : job.title,
        requirements: extractRequirements(description),
        responsibilities: [],
        technologies: extractTechnologies(description),
        postedAt: job.updated_at ? new Date(job.updated_at).toISOString() : null,
      } satisfies RawJob;
    });
  }

}
