# Job Bot

A personal job-search and application agent. Discovers jobs, scores them against
a profile, explains the match, and prepares application material — with final
submission always gated behind explicit human approval.

**Current state: Phase 5 — Real job sources.** Jobs come from public, documented job-board APIs and a local mock source.
Applications **can** be submitted, and every submission requires an explicit
human approval recorded in the database first.

The system is **multi-CV**: each CV is a directory under `data/profiles/`, and
discovery, matching, applications and generated material are all scoped to the
profile they belong to.

---

## Quick start

### Option A — everything in Docker

```bash
cp .env.example .env
docker compose up --build
```

Starts Postgres, applies migrations, seeds the database, and serves the
dashboard at <http://localhost:3000>.

### Option B — Postgres in Docker, app on the host (faster HMR)

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d

pnpm install
pnpm db:migrate     # applies migrations, generates the Prisma client
pnpm db:seed        # loads data/profile + data/jobs fixtures
pnpm discover       # searches on behalf of every profile
pnpm match          # scores every unscored job for the first profile
pnpm dev            # http://localhost:3000
```

Requires Node 20.11+ and pnpm 10.

---

## What you can do right now

| Page | Shows |
| --- | --- |
| `/` | Job counts, duplicates collapsed, pipeline totals |
| `/jobs` | All discovered jobs, filterable by score, role, company, location, status |
| `/jobs/[id]` | Description, extracted requirements, match analysis, sources, audit history |
| `/review` | **Ready to apply** — generated material with Reject / Edit / Approve |
| `/applications` | The pipeline board, grouped by status |
| `/profile` | The active profile, preferences and full experience history |

Every page takes a `?profile=<slug>` parameter and shows a switcher when more
than one CV is present.

---

## Your data — edited in the dashboard

**Everything is editable at `/profile`.** Identity, target roles, salary, work
authorization, exclusions, skills, education, experiences and projects all have
forms — nothing requires touching a file.

**Export to files** writes the profile back to `data/profiles/<slug>/`, so the
JSON stays a diffable, version-controllable copy of what the system believes:

```bash
pnpm export                  # every profile
pnpm export --profile nare
```

Because the dashboard is now the place edits happen, `pnpm db:seed` **skips
profiles that already exist** rather than silently overwriting them. Use
`pnpm db:seed:force` to deliberately re-import from files.

Each CV is a directory:

```
data/profiles/<slug>/profile.json      preferences, skills, salary, work authorization
data/profiles/<slug>/experience.json   actual professional history
data/profiles/<slug>/education.json    degrees, courses and certifications
data/profiles/<slug>/master-resume.md  the master resume
```

**Adding a CV is adding a directory** with a `profile.json` whose `slug`
matches the directory name, then `pnpm db:seed`. Every file is validated
against the same Zod schemas the forms use, so a malformed edit is rejected
with a field-level error rather than half-applied.

`experience.json` is the only corpus the resume and question agents may draw
from. Anything not recorded there does not exist as far as the agent is
concerned — it reports the gap rather than inventing a claim.

---

## Job sources

Sources implement one interface and everything downstream speaks `RawJob`, so
adding one changes nothing else.

| Source | What it reads |
| --- | --- |
| `MockJobSource` | `data/jobs/mock-jobs.json` — always available, keeps the pipeline exercisable offline |
| `GreenhouseJobSource` | Public Greenhouse board APIs, one per company |

Greenhouse publishes each customer's board as documented, unauthenticated JSON.
No HTML scraping, no evasion. The trade-off is that boards are **per-company**,
so `data/sources/greenhouse-boards.json` is a watchlist rather than a search:

```json
[{ "board": "duolingo", "company": "Duolingo" }]
```

Salary is not published in a structured field, so those postings carry none —
which the scorer treats as unassessable rather than as a low salary. A board
that cannot be read is logged and skipped; one bad entry never fails a run.

Set `USE_MOCK_SOURCE=false` to run against real sources only.

---

## Matching

Scoring is hybrid, and the split is enforced in code:

- **`@job-bot/matching` owns the number.** Six factors — technical skills,
  role, seniority, location, salary, employment type — each scored 0–100 and
  combined by weight. A factor that cannot be assessed (no published salary, no
  stated employment type) has its weight redistributed rather than scoring
  zero: absence of data never looks like a bad match.
- **The LLM only explains.** `MatchingAgent` passes the profile, the posting and
  the computed factor breakdown to the model and asks for reasoning, nuanced
  gaps and a confidence value — validated against a Zod schema before use. The
  model cannot change the score.
- **Two hard rules cap the score.** An excluded company or technology caps it at
  15; a posting whose technologies barely overlap the profile caps it at 35,
  however well the title and location fit.

Running without an LLM is fully supported: with no `ANTHROPIC_API_KEY` the
provider factory returns a null provider, deterministic scoring still runs, and
the dashboard marks those matches "deterministic only".

```bash
pnpm discover        # search sources, deduplicate, persist
pnpm match           # score jobs that have no match
pnpm match --all     # rescore everything
pnpm worker run      # discover, then match
```

### Cost of a matching run

Matching runs over every discovered job, so it is where the token spend is.
Five levers, in order of effect:

| Lever | Effect |
| --- | --- |
| **Call ceiling** (`--max-calls`, off by default) | A hard cap on model calls for the whole run — across every profile, not per profile. The threshold decides *which* jobs deserve reasoning; it cannot bound cost, because how many clear it is not known until the run is under way. Once the ceiling is reached the remaining jobs are still scored, deterministically. |
| **Reasoning threshold** (default 45) | Below it, no model call is made at all. On the current 202-job set that skips **119 jobs — 59%**. Reasoning exists to help you decide, and nobody reads the explanation for a job scoring 22. |
| **Concurrency** (default 6) | Matching is network-bound. Sequential runs waste almost all of the wall clock. |
| **Prompt caching** | The candidate half of the prompt is identical for every job in a run, so it lives in the system prompt and is marked cacheable — cache reads cost roughly a tenth of fresh input. |
| **Per-task model** | `LLM_MATCH_MODEL` runs matching on a different model from generation. It defaults to `LLM_MODEL`, because picking a cheaper model is your call, not the code's. |

```bash
pnpm match --all-profiles --min-reason 55 --concurrency 8
pnpm match --all-profiles --min-reason 65 --max-calls 100
LLM_MATCH_MODEL=claude-haiku-4-5 LLM_MATCH_EFFORT=low pnpm match
```

Every skipped job still gets a full deterministic score, a factor breakdown and
a written explanation built from the factors — it simply has no model reasoning
attached, and the dashboard says so. That holds for jobs skipped by the
threshold and for jobs skipped because the ceiling was reached, so a capped run
leaves no job unscored.

`--max-calls` refuses a value it cannot parse rather than falling back to
unlimited: a typo in the flag that bounds your spend must not be the thing that
removes the bound.

> **Caching has a minimum.** A prefix shorter than the model's threshold (512
> tokens on Claude Opus 5, more on others) silently does not cache. A compact
> profile can fall under it. The `cachedInputTokens` field on each
> `Match reasoned` log line tells you whether it engaged.

---

## Generating application material

`pnpm prepare` produces a tailored resume, a cover letter and answers to the
standard application questions for the profile's shortlisted jobs, then parks
each one at `READY_FOR_REVIEW`.

**Fabrication is prevented structurally, not by asking nicely.** Which
experience is relevant is chosen deterministically before the model is called.
Every resume bullet the model returns must name the experience it came from and
quote, verbatim, the recorded text it was rewritten from. `verifyResumeDraft`
checks each quote against the experience database; a draft containing a single
untraceable claim is **discarded**, not published with a warning. Highlighted
skills must exist on the profile. Cover letters are checked for organisation
names that match nothing on record.

Application answers carry an explicit strength — `STRONG`, `LIMITED`,
`ADJACENT` or `NONE` — so "I have used GCP" can never be presented as AWS
experience. Anything the profile does not cover is surfaced as
`missingInformation` rather than filled in.

```bash
pnpm prepare                      # first profile, jobs scoring 65+
pnpm worker prepare --profile arpine --min 70 --limit 5
```

---

## Filling forms

`pnpm fill` opens an application form, describes every control, maps the
controls to recorded facts, fills them, uploads the verified resume, takes a
screenshot, and **stops**.

```bash
pnpm fill                                   # against the bundled local test form
pnpm worker fill --profile arpine --headed  # watch it happen
pnpm worker fill --url file:///path/to/form.html
```

The default target is `data/test-forms/application-form.html`, a local fixture
with no `action`, so the whole path is exercisable without touching anyone's
real careers site.

**Submission is blocked in the browser layer, not above it.**
`BrowserAgent.click` inspects each control's label, name, id and type, and
*throws* on anything that looks like submit — it does not return a failure a
caller could retry past. The guard sits there rather than in the application
logic precisely so no caller can route around it. `looksLikeSubmit` flattens
separators before matching, because a button named `apply_button` would
otherwise slip past a word-boundary pattern.

Field mapping is deterministic. Which box gets an email address is a lookup,
not a judgement, and a wrong answer is invisible in a screenshot. Sponsorship
questions are resolved by polarity — "do you require sponsorship" and "are you
authorized to work" take opposite answers — and always ask for human
confirmation. A field matching no rule is left empty and reported, never
guessed. Only genuine open questions reach the QuestionAgent.

Every run writes a `FORM_FILLED` audit event recording what was filled, what
was not, which submit controls were detected, and that submission was skipped.

---

## Layout

```
apps/
  web/          Next.js dashboard (App Router, server components)
apps/
  worker/       CLI: discovery and matching runs
packages/
  shared/       Zod schemas, domain enums, logger, path/env helpers
  database/     Prisma schema, migrations, seed, repositories
  jobs/         JobSource interface, normalization, dedup, mock + Greenhouse sources
  matching/     Deterministic seven-factor scorer (no LLM, no database)
  resume/       Experience selection, grounding verification, resume rendering
  browser/      Playwright wrapper, form-field extraction, submit guard
  agent/        LLM provider abstraction and the Matching, Resume and Question agents
data/
  profile/      your profile and experience (editable)
  resumes/      master resume
  jobs/         mock job fixtures and placeholder match fixtures
```

Workspace packages ship TypeScript source rather than a build artefact; Next
transpiles them and `tsx` runs them directly, so there is no per-package build
step to keep in sync.

---

## Deduplication

A `Job` is the canonical posting. Every time a source reports it, a
`JobSighting` row is written. `Job.dedupeKey` is a hash of the normalized
company, title and location bucket, with a unique index behind it — so the same
opening found on three boards is one job with three sightings, not three jobs.

The mock fixture contains three deliberate cross-source duplicates: 20 postings
collapse to 17 jobs. The jobs table marks them, and the job detail page lists
every source a posting was seen on.

---

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the dashboard |
| `pnpm build` | Compile the dashboard to `.next` |
| `pnpm start` | Serve the compiled dashboard, honouring `PORT` |
| `pnpm build` | Production build |
| `pnpm typecheck` | Typecheck every package |
| `pnpm test` | Run the test suite |
| `pnpm db:migrate` | Create/apply a migration in development |
| `pnpm db:deploy` | Apply existing migrations (production/CI) |
| `pnpm db:seed` | Load profile and job fixtures |
| `pnpm db:studio` | Browse the database in Prisma Studio |
| `pnpm db:reset` | Drop, re-migrate and re-seed |
| `pnpm discover` | Run discovery across every source |
| `pnpm match` | Score jobs that have no match (`--all` to rescore, `--profile <slug>`, `--all-profiles`) |
| `pnpm prepare` | Generate and verify application material for shortlisted jobs |
| `pnpm fill` | Fill an application form and stop before submission |
| `pnpm export` | Write profiles from the database back to `data/profiles/` |
| `pnpm db:seed:force` | Re-import from files, overwriting dashboard edits |

---

## Safety

- **Submission requires a recorded human approval.** `BrowserAgent.click` still
  refuses submit controls — permanently, so no generic code path can submit by
  accident. Only `submitForm` can, and it demands an authorization built from a
  persisted approval whose actor is a human. An application that has already
  been submitted can never be submitted twice.
- **Two ways to send.** *Hand off* opens a visible browser with the form filled
  and lets you click submit yourself. *Auto-submit* clicks it for you, once you
  have approved that specific application.
- The agent may only assert experience recorded in the profile's
  `experience.json`, and every generated claim is verified against it.
- Missing information is reported as missing, never filled in.
- Every status change and agent action is written to an append-only audit log.
- The browser layer refuses to click submit controls, by throwing.
- No stealth or anti-bot evasion is implemented.

---

## Picking this up

[docs/HANDOFF.md](docs/HANDOFF.md) — current state, what to run first, the
gotchas, and what not to change. Start there.

## Roadmap

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Monorepo, schema, profile, mock jobs, dedup, dashboard | **done** |
| 2 | Deterministic scoring + LLM reasoning, `apps/worker` | **done** |
| 3 | Tailored resumes, cover letters, application answers, approval screen | **done** |
| 4 | Playwright form filling against a local test form, stopping before submit | **done** |
| 5 | Real job sources, one at a time | **Greenhouse done**; more can be added the same way |
