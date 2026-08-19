import { describe, expect, test } from "vitest";
import { jobSearchQuerySchema } from "@job-bot/shared";
import { ArbeitnowJobSource } from "../sources/arbeitnow-source";

const query = jobSearchQuerySchema.parse({ limit: 100 });

const entry = (overrides: Record<string, unknown> = {}) => ({
  slug: "senior-backend-engineer-berlin-1",
  company_name: "Kleinwerk GmbH",
  title: "Senior Backend Engineer",
  // Long enough to clear the content-free floor, as a real posting would be.
  description:
    "<p>We build services in <strong>TypeScript</strong> on PostgreSQL and Docker. " +
    "You will own features end to end, from API design through to deployment, working " +
    "closely with product and design. We care about tested code, clear interfaces and " +
    "shipping steadily rather than heroically. Remote-friendly within Europe.</p>",
  remote: true,
  location: "Berlin",
  tags: ["Software Engineering"],
  job_types: ["Full-time"],
  created_at: 1786516800,
  ...overrides,
});

/** Serves one page of entries, then empty pages. */
const stubFetch = (pages: Record<number, unknown[]>): typeof fetch =>
  (async (url: string | URL | Request) => {
    const page = Number(new URL(String(url)).searchParams.get("page") ?? "1");
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: pages[page] ?? [] }),
    } as Response;
  }) as unknown as typeof fetch;

describe("ArbeitnowJobSource", () => {
  test("declares that it does not return a full catalogue", () => {
    // Staleness detection must skip this source; a rolling window says nothing
    // about postings older than the window.
    expect(new ArbeitnowJobSource().returnsFullCatalogue).toBe(false);
  });

  test("maps a feed entry onto a RawJob with a usable posting URL", async () => {
    const source = new ArbeitnowJobSource({ pages: 1 }, stubFetch({ 1: [entry()] }));

    const [job] = await source.search(query);

    expect(job).toMatchObject({
      source: "arbeitnow",
      externalId: "senior-backend-engineer-berlin-1",
      company: "Kleinwerk GmbH",
      title: "Senior Backend Engineer",
      isRemote: true,
      employmentType: "FULL_TIME",
    });
    expect(job?.url).toBe("https://www.arbeitnow.com/view/senior-backend-engineer-berlin-1");
    expect(job?.technologies).toEqual(expect.arrayContaining(["TypeScript", "PostgreSQL"]));
    expect(job?.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("keeps the city on a remote posting so eligibility can read the region", async () => {
    const source = new ArbeitnowJobSource({ pages: 1 }, stubFetch({ 1: [entry()] }));

    const [job] = await source.search(query);

    expect(job?.location).toBe("Remote - Berlin");
  });

  test("drops an entry with no description rather than storing an unscoreable job", async () => {
    const source = new ArbeitnowJobSource(
      { pages: 1 },
      stubFetch({ 1: [entry({ description: "   " }), entry({ slug: "keeper" })] }),
    );

    const jobs = await source.search(query);

    expect(jobs.map((job) => job.externalId)).toEqual(["keeper"]);
  });

  test("reads several pages and stops when the feed runs out", async () => {
    const source = new ArbeitnowJobSource(
      { pages: 5 },
      stubFetch({ 1: [entry({ slug: "a" })], 2: [entry({ slug: "b" })] }),
    );

    const jobs = await source.search(query);

    expect(jobs.map((job) => job.externalId)).toEqual(["a", "b"]);
  });

  test("returns what it already read when a page fails", async () => {
    const failing = (async (url: string | URL | Request) => {
      const page = Number(new URL(String(url)).searchParams.get("page") ?? "1");
      if (page === 2) return { ok: false, status: 503 } as Response;
      return { ok: true, status: 200, json: async () => ({ data: [entry({ slug: "a" })] }) } as Response;
    }) as unknown as typeof fetch;

    const jobs = await new ArbeitnowJobSource({ pages: 3 }, failing).search(query);

    expect(jobs.map((job) => job.externalId)).toEqual(["a"]);
  });
});

describe("ArbeitnowJobSource — a feed always carries dirty records", () => {
  test("keeps the good entries on a page containing a malformed one", async () => {
    const source = new ArbeitnowJobSource(
      { pages: 1 },
      stubFetch({ 1: [entry({ slug: "good-1" }), { slug: "broken" }, entry({ slug: "good-2" })] }),
    );

    const jobs = await source.search(query);

    expect(jobs.map((job) => job.externalId)).toEqual(["good-1", "good-2"]);
  });

  test("accepts an object where the feed should have sent an empty list", async () => {
    // The live feed serialises an empty job_types as {} for some records.
    const source = new ArbeitnowJobSource(
      { pages: 1 },
      stubFetch({ 1: [entry({ job_types: {}, tags: {} })] }),
    );

    const [job] = await source.search(query);

    expect(job?.externalId).toBe("senior-backend-engineer-berlin-1");
    expect(job?.employmentType).toBeNull();
  });
});

describe("ArbeitnowJobSource — content-free listings", () => {
  const promo = "Find more English Speaking Jobs in United Kingdom on Arbeitnow";

  test("drops a posting whose body is only the aggregator's own advert", async () => {
    const source = new ArbeitnowJobSource(
      { pages: 1 },
      stubFetch({ 1: [entry({ slug: "stub", description: `<p>${promo}</p>` })] }),
    );

    expect(await source.search(query)).toEqual([]);
  });

  test("keeps a real posting and strips the advert from what it stores", async () => {
    const body = `<p>${"We are hiring a backend engineer to build payment services in TypeScript. ".repeat(6)}</p><p>${promo}</p>`;
    const source = new ArbeitnowJobSource({ pages: 1 }, stubFetch({ 1: [entry({ description: body })] }));

    const [job] = await source.search(query);

    expect(job).toBeDefined();
    expect(job?.description).not.toMatch(/Find more/i);
  });
});

describe("ArbeitnowJobSource — remote-only mode", () => {
  test("keeps every posting when the filter is off", async () => {
    const source = new ArbeitnowJobSource(
      { pages: 1 },
      stubFetch({ 1: [entry({ slug: "remote" }), entry({ slug: "onsite", remote: false })] }),
    );

    expect((await source.search(query)).map((job) => job.externalId)).toEqual(["remote", "onsite"]);
  });

  test("drops on-site postings when it is on", async () => {
    // Safe only because this source declares returnsFullCatalogue: false, so
    // nothing infers closure from a posting's absence.
    const source = new ArbeitnowJobSource(
      { pages: 1, remoteOnly: true },
      stubFetch({ 1: [entry({ slug: "remote" }), entry({ slug: "onsite", remote: false })] }),
    );

    expect((await source.search(query)).map((job) => job.externalId)).toEqual(["remote"]);
  });
});
