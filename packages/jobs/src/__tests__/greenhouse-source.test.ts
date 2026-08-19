import { describe, expect, test } from "vitest";
import { jobSearchQuerySchema } from "@job-bot/shared";
import { GreenhouseJobSource } from "../sources/greenhouse-source";
import {
  extractRequirements,
  extractTechnologies,
  resolveIsRemote,
  stripBoilerplate,
} from "../sources/posting-parsing";

const board = { board: "acme", company: "Acme" };

const payload = {
  jobs: [
    {
      id: 101,
      title: "Senior Backend Engineer",
      absolute_url: "https://job-boards.greenhouse.io/acme/jobs/101",
      updated_at: "2026-08-01T10:00:00Z",
      location: { name: "Remote - Europe" },
      content:
        "&lt;p&gt;We use &lt;strong&gt;TypeScript&lt;/strong&gt;, Node.js and PostgreSQL on Kubernetes.&lt;/p&gt;" +
        "&lt;ul&gt;&lt;li&gt;Five or more years building production backend services&lt;/li&gt;" +
        "&lt;li&gt;Comfortable operating services you wrote yourself&lt;/li&gt;&lt;/ul&gt;" +
        "&lt;p&gt;This is a full-time position.&lt;/p&gt;",
    },
    {
      id: 102,
      title: "Machine Learning Intern",
      absolute_url: "https://job-boards.greenhouse.io/acme/jobs/102",
      location: { name: "Berlin, Germany" },
      content: "&lt;p&gt;Work with Python, PyTorch and pandas on our recommendation stack.&lt;/p&gt;",
    },
  ],
};

const fakeFetch = (body: unknown, ok = true): typeof fetch =>
  (async () =>
    ({
      ok,
      status: ok ? 200 : 404,
      statusText: ok ? "OK" : "Not Found",
      json: async () => body,
    })) as unknown as typeof fetch;

const query = (overrides: Parameters<typeof jobSearchQuerySchema.parse>[0] = {}) =>
  jobSearchQuerySchema.parse(overrides);

describe("GreenhouseJobSource", () => {
  test("maps a board payload onto the shared RawJob shape", async () => {
    const source = new GreenhouseJobSource([board], fakeFetch(payload));
    const jobs = await source.search(query());

    expect(jobs).toHaveLength(2);

    const backend = jobs[0]!;
    expect(backend.source).toBe("greenhouse");
    expect(backend.externalId).toBe("acme:101");
    expect(backend.company).toBe("Acme");
    expect(backend.url).toBe("https://job-boards.greenhouse.io/acme/jobs/101");
    expect(backend.isRemote).toBe(true);
    expect(backend.employmentType).toBe("FULL_TIME");
    expect(backend.postedAt).toBe("2026-08-01T10:00:00.000Z");
  });

  test("decodes escaped HTML and strips tags from the description", async () => {
    const [job] = await new GreenhouseJobSource([board], fakeFetch(payload)).search(query());

    expect(job!.description).toContain("TypeScript");
    expect(job!.description).not.toContain("&lt;");
    expect(job!.description).not.toContain("<strong>");
  });

  test("infers technologies against a known vocabulary", async () => {
    const [backend, intern] = await new GreenhouseJobSource([board], fakeFetch(payload)).search(query());

    expect(backend!.technologies).toEqual(
      expect.arrayContaining(["TypeScript", "Node.js", "PostgreSQL", "Kubernetes"]),
    );
    expect(intern!.technologies).toEqual(expect.arrayContaining(["Python", "PyTorch", "pandas"]));
  });

  test("infers employment type from the posting text", async () => {
    const jobs = await new GreenhouseJobSource([board], fakeFetch(payload)).search(query());
    expect(jobs[1]!.employmentType).toBe("INTERNSHIP");
  });

  test("extracts requirement bullets", async () => {
    const [job] = await new GreenhouseJobSource([board], fakeFetch(payload)).search(query());
    expect(job!.requirements.some((line) => /five or more years/i.test(line))).toBe(true);
  });

  test("filters client-side, since the board endpoint has no search", async () => {
    const source = new GreenhouseJobSource([board], fakeFetch(payload));

    expect(await source.search(query({ remoteOnly: true }))).toHaveLength(1);
    expect(await source.search(query({ employmentTypes: ["INTERNSHIP"] }))).toHaveLength(1);
    expect(await source.search(query({ keywords: ["Machine Learning Engineer"] }))).toHaveLength(1);
  });

  test("an unreachable board degrades the run instead of failing it", async () => {
    const source = new GreenhouseJobSource(
      [board, { board: "missing", company: "Missing" }],
      (async (url: string) =>
        url.includes("missing")
          ? { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) }
          : { ok: true, status: 200, statusText: "OK", json: async () => payload }) as unknown as typeof fetch,
    );

    const jobs = await source.search(query());
    expect(jobs).toHaveLength(2);
  });

  test("rejects a payload that does not match the expected shape", async () => {
    const source = new GreenhouseJobSource([board], fakeFetch({ unexpected: true }));
    expect(await source.search(query())).toHaveLength(0);
  });
});

describe("resolveIsRemote — a source's flag does not outrank its own location", () => {
  test("a flag claiming remote is refused when the location names a place", () => {
    expect(resolveIsRemote({ sourceFlag: true, location: "New York, NY (HQ)" })).toBe(false);
  });

  test("a location that says remote is remote, flag or not", () => {
    expect(resolveIsRemote({ sourceFlag: false, location: "Remote U.S." })).toBe(true);
    expect(resolveIsRemote({ location: "Remote, Canada; Remote, US" })).toBe(true);
  });

  test("a remote title counts even when the location does not say so", () => {
    expect(resolveIsRemote({ location: "Berlin", title: "Backend Engineer (Remote)" })).toBe(true);
  });

  test("an unspecified location with a remote flag is taken as remote", () => {
    expect(resolveIsRemote({ sourceFlag: true, location: "Not specified" })).toBe(true);
  });

  test("no flag and no signal means not remote", () => {
    expect(resolveIsRemote({ location: "Yerevan, Armenia" })).toBe(false);
  });
});

describe("stripBoilerplate — company blurb must not read as a technical match", () => {
  const posting = [
    "Senior Program Manager",
    "You will coordinate delivery across teams and own the roadmap.",
    "Requirements",
    "Five years of programme management experience",
    "",
    "About us",
    "We run everything on Ruby, Go, Kubernetes, PostgreSQL and Terraform at scale.",
    "",
    "Benefits",
    "401(k) matching, health insurance and paid time off.",
    "",
    "Equal Opportunity",
    "We consider all applicants without regard to race, religion or disability.",
  ].join("\n");

  test("drops everything from the first boilerplate heading onward", () => {
    const kept = stripBoilerplate(posting);
    expect(kept).toContain("programme management");
    expect(kept).not.toContain("Kubernetes");
    expect(kept).not.toContain("401(k)");
  });

  test("a non-engineering role stops inheriting the company's stack", () => {
    expect(extractTechnologies(posting)).toHaveLength(0);
  });

  test("technologies in the actual job description still count", () => {
    const engineering = "Senior Backend Engineer\nYou will work in Go on Kubernetes.\n\nAbout us\nWe also use Rust.";
    const found = extractTechnologies(engineering);
    expect(found).toContain("Go");
    expect(found).toContain("Kubernetes");
    expect(found).not.toContain("Rust");
  });

  test("legal and benefits lines never become requirements", () => {
    const requirements = extractRequirements(posting);
    expect(requirements.some((line) => /without regard to|401\(k\)/i.test(line))).toBe(false);
  });

  test("a posting that is almost entirely boilerplate is left intact", () => {
    // Cutting here would leave nothing useful, so the heuristic backs off.
    const mostlyBlurb = "About us\nWe are a company that uses TypeScript and PostgreSQL everywhere and we are hiring.";
    expect(stripBoilerplate(mostlyBlurb)).toBe(mostlyBlurb);
  });
});
