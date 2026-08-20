# Handoff — 2026-08-21

State of the system, what is trustworthy, and what to do next. Supersedes the
2026-08-18 handoff. Written at the end of the session that made the shortlist
realistic, moved the terminal workflow into the UI, deployed to Vercel, and put
the dashboard behind Clerk.

---

## Current state

Verified, not assumed: **285 tests pass, 10/10 packages typecheck, `pnpm build`
exits 0.** Latest commit `f98a80d`.

| Thing | State |
| --- | --- |
| Job sources | Greenhouse, Ashby, Lever, Arbeitnow, **staff.am** |
| Matching | Deterministic **seven**-factor scorer; `WORK_ELIGIBILITY` added this session |
| Auth | Clerk Core 3, whole dashboard protected, dark-themed |
| Deployment | Vercel + Supabase. Schema deployed; **no data seeded** |
| Example data | `data/example/` — Ada Lovelace and Grace Hopper, wholly fictional |
| Local database | Four profiles: `nare`, `arpine`, `ada`, `grace` |

**Still no model reasoning on any match** — the API key has no credit, so every
score remains deterministic-only. `LLM_PROVIDER=none` reproduces that state
free of charge.

---

## What changed this session

**The shortlist was unrealistic because matching scored preference, not
permission.** Both real profiles are in Yerevan and can only work without
sponsorship in Armenia. Adding a `WORK_ELIGIBILITY` factor (weight 0.18, plus a
gate at <25) took `nare` from 73 apparent matches ≥65 down to **5 real ones**.
That is the single most important change in the repo.

**Geography was the wrong axis; hiring policy is the right one.** Curating
small European companies produced **0 reachable jobs out of 518** — European
firms hire remote within the EU. All-remote companies (Supabase, PostHog,
GitLab), crypto (Parity, Consensys) and talent platforms (Turing, Andela,
Braintrust) produced **90 of 125** reachable roles.

**Armenia was invisible to every ATS.** Zero of 3,200 postings mentioned it,
and only 1 of 22 Armenian employers uses Greenhouse/Ashby/Lever. `staff.am`
closed that gap — 1,230 jobs behind a Next.js data endpoint.

**Seniority is capped at large employers.** `LARGE_EMPLOYER_CEILINGS` scores
principal/leadership at 10 and lead at 20, so big-company senior+ roles stop
surfacing, while mid and "Senior I" still do. Company size is read from the
posting text.

**Rejections now feed back in.** `classifyRejectionFeedback` maps verbatim
rejection text onto a closed vocabulary, so objective signal survives even when
the wording is subjective. Two real rejections are recorded.

---

## Do this first

```bash
pnpm install && pnpm db:deploy
pnpm dev                       # http://localhost:3000
```

Everything below is free — no model calls:

```bash
LLM_PROVIDER=none pnpm discover
LLM_PROVIDER=none pnpm match -- --all
```

`--all` is required. Every posting already carries a deterministic match, so a
plain `match` selects zero jobs and exits having done nothing.

When there is API credit, the reasoned pass is:

```bash
pnpm match -- --all --max-calls 50
```

---

## Gotchas you will hit

Ordered by how much time they cost when unknown.

- **Next loads `.env` from the app directory, not the repo root.** `pnpm start`
  runs `next start` with cwd `apps/web`, so the root `.env` is never read and
  `CLERK_SECRET_KEY` is undefined at runtime. The middleware still runs and
  unauthenticated redirects still work, so the app looks fine until a *signed-in*
  request calls `auth()` and fails with `auth_signature_invalid` — which reports
  itself as "clerkMiddleware() not detected" and sends you hunting the matcher
  instead of the environment. `apps/web/.env` is now a symlink to `../../.env`;
  it is git-ignored. If auth breaks after a fresh clone, check that symlink first.
- **Never rebuild while a server is serving that build.** `next start` holds
  chunks from the build it started with; replacing `.next` underneath yields
  errors deep in `.next/server/chunks/*.js` that look like library bugs — Clerk
  in particular claims its middleware "did not run". Stop, rebuild, start. Check
  for orphans with `ps -eo pid,etime,cmd | grep next-server`; this session found
  two servers from earlier runs still holding the port.
- **Clerk Core 3 is not what the public quickstart shows.** `<SignedIn>` was
  removed — use `<Show when="signed-in">`. `auth.protect()` 404s a protected
  route rather than redirecting, so `middleware.ts` redirects explicitly and
  carries `redirect_url`. Verify Clerk APIs against
  `node_modules/.pnpm/@clerk+react@*/dist/types-*.d.mts`, not the docs site.
- **`match` without `--all` is a silent no-op.** No error, no cost, no work.
- **A failed model call still consumes `--max-calls`.** The ceiling counts
  attempts, because a failed call may still be billed.
- **Only a source that returns its whole catalogue may close a posting.**
  `JobSource.returnsFullCatalogue` says which. Arbeitnow is a rolling feed, so
  absence means "outside the window", not "taken down".
- **Never validate an aggregator page as a whole.** Three malformed records once
  discarded all 176 good ones. Entries are parsed individually.
- **staff.am's `buildId` changes on every deploy.** It is discovered at runtime;
  never hard-code it.
- **An unrecognised remote qualifier means restricted, not open.** "Remote —
  Japan" scored 75 as "unrestricted" until the place vocabulary became an
  allowlist. Unknown qualifier ⇒ assume it excludes Armenia.
- **`.env` does not override an exported shell variable.** A stale
  `ANTHROPIC_API_KEY` in the shell silently shadows the file.
- **Restart the dev server after `prisma generate`.**
- **`pnpm build` writes `.next`** and will clobber a running dev server; use
  `pnpm --filter @job-bot/web run build:isolated` when one is up.
- **`pnpm db:seed` skips profiles that already exist**; `db:seed:force`
  re-imports.
- **Discovery fetches unfiltered catalogues on purpose.** Filtering there breaks
  staleness detection. Relevance is matching's job.
- **Every export from a `"use server"` file must be async.** A plain constant
  there is a build error; `settable-statuses.ts` exists for that reason.

---

## Personal data — read before pushing anything

The user's standing constraint, in their words: *"ensure no personal stuff is
sent to the remote or saved anywhere"*.

- `data/profiles/` is git-ignored and must stay so. `data/example/` is the only
  profile data that may be committed, and it is fictional.
- **Do not run `pnpm db:seed` against Supabase.** It would push real CVs to the
  cloud. Supabase intentionally has schema and no data.
- **Known gap, not yet resolved:** the real employment history still exists in
  git history via `data/profiles.example/` in the baseline commit. The history
  has already been rewritten twice; a third rewrite should be the user's call,
  not a surprise. Raise it before the repo goes public.

---

## Do not change

- The deterministic scorer's ownership of the score. The LLM explains a match;
  it can never set the number.
- Deterministic experience selection before drafting.
- Resume bullets quoting recorded text verbatim; `verifyResumeDraft` rejects a
  draft with one untraceable claim.
- `BrowserAgent.click` refusing submit controls. Only `submitForm` sends, and
  only with an authorization derived from a persisted human approval.
- Handoff as the default submit mode; dry-run as the default for `submit`.
- The `human:` actor requirement — `currentActor()` throws rather than falling
  back to a default identity. Strengthen it, never relax it.
- `submittedAt` being set on any click. It is what makes a duplicate
  impossible; uncertainty is carried by `submissionStatus: UNCONFIRMED`.

---

## What is left

1. **`/setup` does not exist.** An empty database 404s straight after sign-in.
   This is what a first-time Vercel visitor hits.
2. **Vercel `DATABASE_URL` should be Supabase's pooled endpoint** — `:6543`
   with `pgbouncer=true&connection_limit=1`. It is currently the direct `:5432`
   host, which will exhaust connections under serverless.
3. **The pipeline panel and submit cannot work on Vercel.** They spawn `pnpm`,
   drive Playwright and write to disk. On serverless they need to be disabled
   or moved to a long-running worker.
4. **Decide whether to drop `ada` and `grace` locally** — they were added to
   test seeding without touching real data.

---

## Known-imperfect, accepted for now

- **`fill`/`submit` have only ever run against `data/test-forms/`.** Real ATS
  forms are multi-step, use custom widgets and sometimes sit in iframes.
- **Technology extraction is a fixed vocabulary**
  (`data/sources/technologies.json`). Anything absent is invisible to matching.
- **The cover-letter proper-noun check produces false positives.**
- **Prompt caching is wired but likely inert** — the cached prefix is under the
  512-token minimum.
- **No tests** for repositories, worker orchestration or the web layer; no E2E.
- **Supabase is 336× slower than localhost** — 235.5ms versus 0.7ms per round
  trip, measured. Anything chatty must batch; concurrency took a 2,387-job run
  from 22.0s to 4.2s.
- **Data unconfirmed by its owners**: Arpine's work-authorization notes and
  `requiresSponsorship`, her `yearsOfExperience`, and Nare's `salaryMin: 2000`
  recorded against `salaryPeriod: YEAR` — which will print "USD 2,000 per year"
  onto a form. All editable at `/profile/edit`.

---

## Context for whoever picks this up

Read `README.md` for usage and the matching/grounding design. Start from the
code; you do not need the build history.

The one idea worth carrying forward: **this system's value is in what it
refuses to surface.** Most of the work here has been narrowing — eligibility,
seniority ceilings, grounding checks, submit refusals. A change that makes the
shortlist longer is probably a regression.
