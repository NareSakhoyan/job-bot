import { describe, expect, test } from "vitest";
import { jobSearchQuerySchema } from "@job-bot/shared";
import { StaffAmJobSource } from "../sources/staffam-source";

const query = jobSearchQuerySchema.parse({ limit: 100 });

const listing = (overrides: Record<string, unknown> = {}) => ({
  id: 162906,
  title: { en: "Senior Full Stack Developer", am: "Ծրագրավորող" },
  slug: { en: "senior-full-stack-developer-12" },
  is_remote: false,
  job_city: { title: { en: "Yerevan", am: "Երևան" } },
  category: { title: { en: "Software Development" }, code: "software" },
  companiesStruct: { title: { en: "Picsart" }, slug: "picsart" },
  deadline: "2026-09-18",
  ...overrides,
});

/** Serves the listing HTML (for build-id discovery) and then page data. */
const stubFetch = (pages: Record<number, unknown[]>, buildId = "BUILD123"): typeof fetch =>
  (async (url: string | URL | Request) => {
    const href = String(url);
    if (href.endsWith("/en/jobs")) {
      return {
        ok: true,
        status: 200,
        text: async () => `<script id="__NEXT_DATA__">{"buildId":"${buildId}","x":1}</script>`,
      } as Response;
    }
    const page = Number(new URL(href).searchParams.get("page") ?? "1");
    return {
      ok: true,
      status: 200,
      json: async () => ({ pageProps: { jobs: pages[page] ?? [], totalCount: 1230 } }),
    } as Response;
  }) as unknown as typeof fetch;

describe("StaffAmJobSource", () => {
  test("does not claim to return a full catalogue", () => {
    expect(new StaffAmJobSource().returnsFullCatalogue).toBe(false);
  });

  test("maps a listing entry, naming Armenia so eligibility can read it", async () => {
    const source = new StaffAmJobSource({ pages: 1 }, stubFetch({ 1: [listing()] }));

    const [job] = await source.search(query);

    expect(job).toMatchObject({
      source: "staffam",
      externalId: "162906",
      company: "Picsart",
      title: "Senior Full Stack Developer",
      location: "Yerevan, Armenia",
      isRemote: false,
    });
    // The canonical path includes the category; /en/job/<slug> only redirects.
    expect(job?.url).toBe("https://staff.am/en/jobs/software/senior-full-stack-developer-12");
  });

  test("labels a remote posting so it reads as remote from Armenia", async () => {
    const source = new StaffAmJobSource({ pages: 1 }, stubFetch({ 1: [listing({ is_remote: true })] }));

    const [job] = await source.search(query);

    expect(job?.isRemote).toBe(true);
    expect(job?.location).toBe("Remote - Armenia");
  });

  test("accepts the numeric truthiness the board actually sends", async () => {
    const source = new StaffAmJobSource({ pages: 1 }, stubFetch({ 1: [listing({ is_remote: 1 })] }));

    expect((await source.search(query))[0]?.isRemote).toBe(true);
  });

  test("falls back to the Armenian title when no English one is given", async () => {
    const source = new StaffAmJobSource(
      { pages: 1 },
      stubFetch({ 1: [listing({ title: { en: null, am: "Ծրագրավորող" } })] }),
    );

    expect((await source.search(query))[0]?.title).toBe("Ծրագրավորող");
  });

  test("keeps good entries when one is malformed", async () => {
    const source = new StaffAmJobSource(
      { pages: 1 },
      stubFetch({ 1: [listing(), { id: "not a number" }, listing({ id: 2, slug: { en: "b" } })] }),
    );

    expect((await source.search(query)).map((job) => job.externalId)).toEqual(["162906", "2"]);
  });

  test("filters to remote when asked", async () => {
    const source = new StaffAmJobSource(
      { pages: 1, remoteOnly: true },
      stubFetch({ 1: [listing(), listing({ id: 2, slug: { en: "b" }, is_remote: true })] }),
    );

    expect((await source.search(query)).map((job) => job.externalId)).toEqual(["2"]);
  });

  test("skips the source rather than guessing when the build id cannot be read", async () => {
    // The id changes on every staff.am deploy; a pinned one would 404 silently.
    const noBuildId = (async () => ({ ok: true, status: 200, text: async () => "<html></html>" }) as Response) as unknown as typeof fetch;

    expect(await new StaffAmJobSource({ pages: 1 }, noBuildId).search(query)).toEqual([]);
  });
});

describe("StaffAmJobSource — category filtering", () => {
  const engineering = listing({ id: 1, slug: { en: "a" }, category: { title: { en: "Software Development" }, code: "software-development" } });
  const courier = listing({ id: 2, slug: { en: "b" }, category: { title: { en: "Logistics" }, code: "logistics" } });

  test("keeps everything when no categories are named", async () => {
    const source = new StaffAmJobSource({ pages: 1 }, stubFetch({ 1: [engineering, courier] }));

    expect((await source.search(query)).map((job) => job.externalId)).toEqual(["1", "2"]);
  });

  test("keeps only the named categories", async () => {
    // The board carries a whole economy; a courier vacancy is not a near miss
    // for a software engineer.
    const source = new StaffAmJobSource(
      { pages: 1, categories: ["software-development", "other-it"] },
      stubFetch({ 1: [engineering, courier] }),
    );

    expect((await source.search(query)).map((job) => job.externalId)).toEqual(["1"]);
  });

  test("drops a posting with no category when a filter is set", async () => {
    const source = new StaffAmJobSource(
      { pages: 1, categories: ["software-development"] },
      stubFetch({ 1: [listing({ id: 3, slug: { en: "c" }, category: null })] }),
    );

    expect(await source.search(query)).toEqual([]);
  });
});

describe("StaffAmJobSource — detail enrichment", () => {
  const withDetail = (detail: unknown): typeof fetch =>
    (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith("/en/jobs")) {
        return { ok: true, status: 200, text: async () => '{"buildId":"B1"}' } as Response;
      }
      if (href.includes("/en/jobs.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            pageProps: {
              jobs: [
                listing({
                  slug: { en: "senior-dev-1" },
                  category: { title: { en: "Software Development" }, code: "software-development" },
                }),
              ],
            },
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => detail } as Response;
    }) as unknown as typeof fetch;

  test("lifts the body, requirements and stack out of the detail page", async () => {
    const source = new StaffAmJobSource(
      { pages: 1, fetchDetails: true },
      withDetail({
        pageProps: {
          job: {
            description: { en: "<p>We build services in TypeScript and PostgreSQL.</p>" },
            required_qualifications: { en: "<ul><li>Five years with React</li><li>Strong SQL</li></ul>" },
            responsibilities: { en: "<ul><li>Ship features end to end</li></ul>" },
            skills: [{ title: { en: "Docker" } }],
            job_type: { title: { en: "Full time" } },
            job_candidate_level: { title: { en: "Senior" } },
          },
        },
      }),
    );

    const [job] = await source.search(query);

    expect(job?.technologies).toEqual(expect.arrayContaining(["TypeScript", "PostgreSQL", "React"]));
    expect(job?.requirements).toEqual(["Five years with React", "Strong SQL"]);
    expect(job?.responsibilities).toEqual(["Ship features end to end"]);
    expect(job?.employmentType).toBe("FULL_TIME");
  });

  test("prepends the stated level, which the board keeps out of the title", async () => {
    const source = new StaffAmJobSource(
      { pages: 1, fetchDetails: true },
      withDetail({
        pageProps: {
          job: {
            description: { en: "<p>Backend work in Node.js.</p>" },
            job_candidate_level: { title: { en: "Senior" } },
          },
        },
      }),
    );

    expect((await source.search(query))[0]?.title).toMatch(/^Senior /);
  });

  test("keeps the listing-only job when the detail page fails", async () => {
    const failing = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith("/en/jobs")) {
        return { ok: true, status: 200, text: async () => '{"buildId":"B1"}' } as Response;
      }
      if (href.includes("/en/jobs.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ pageProps: { jobs: [listing({ slug: { en: "x" }, category: { title: { en: "IT" }, code: "other-it" } })] } }),
        } as Response;
      }
      return { ok: false, status: 500 } as Response;
    }) as unknown as typeof fetch;

    const jobs = await new StaffAmJobSource({ pages: 1, fetchDetails: true }, failing).search(query);

    // A thin posting beats no posting; the scorer already reports unassessable
    // technical fit honestly.
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.technologies).toEqual([]);
  });
});
