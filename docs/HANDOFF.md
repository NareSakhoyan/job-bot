# Handoff — 2026-08-18

State of the system, what is trustworthy, and what to do next. Written at the
end of the session that built Phases 1–5 and the P0/P1 hardening pass.

---

## Current state

Verified, not assumed: **187 tests pass, 9/9 packages typecheck, all 7 web
routes return 200.**

| Thing | State |
| --- | --- |
| Job sources | Greenhouse + Ashby + Lever adapters, 11 companies, **1171 open jobs** (184 closed by the staleness sweep) |
| Matching | Deterministic seven-factor scorer owns the score; the LLM adds reasoning only above a threshold. All 1171 scored |
| Profiles | Two CVs (`nare`, `arpine`), fully editable at `/profile/edit` |
| Application material | Resume + cover letter + answers, each verified against recorded experience before storage |
| Browser | Fills forms, prints PDF resumes, refuses to submit without a recorded human approval |
| Submission | Both modes work — handoff (default) and auto. Verified end to end against the local fixture |

**No model reasoning is attached to any match yet** — the previous API key ran
out of credit, so every score is deterministic-only.

---

## Architecture, briefly

```
apps/web      Next 15 App Router, RSC + server actions, Clerk authentication
apps/worker   CLI: discover · match · prepare · fill · submit · export · purge
packages/
  shared      Zod schemas, enums, logger, path/env resolution
  database    Prisma schema, migrations, repositories
  jobs        JobSource interface, normalize/dedupe, ATS source adapters
  matching    Six-factor scorer — pure, no LLM, no database
  resume      Experience ranking, grounding verification, render
  agent       LLMProvider seam, Matching/Resume/Question/Application agents
  browser     Playwright wrapper, form extraction, submission authorization
```

Flow: `discover → normalize/dedupe → match → prepare → human review → fill → submit → track`

Load-bearing decisions, all deliberate:

- **The score is deterministic.** The LLM explains a match; it can never set or
  change the number.
- **Experience selection is deterministic.** Which recorded experience is
  relevant is decided in code before any prompt is built.
- **Resume bullets carry provenance.** Each must quote recorded text verbatim;
  `verifyResumeDraft` rejects a draft containing one untraceable claim.
- **`BrowserAgent.click` refuses submit controls, permanently.** Only
  `submitForm` can send, and only with an authorization derived from a
  persisted human approval.
- **Everything is per-profile.** Jobs are global; matches and applications are
  scoped to the CV they belong to.

---

## Do this first

Three steps, roughly $3 total.

```bash
docker compose -f docker-compose.dev.yml up -d      # Postgres
pnpm --filter @job-bot/web run dev                  # dashboard on :3000

# 1. Reasoned shortlist (86 calls, ~$0.30 on Haiku)
#    --all is required: without it, match only scores jobs that have no match
#    row yet, so on an already-scored catalogue it is a no-op.
pnpm match --all-profiles --all --min-reason 65 --max-calls 120

# 2. Prepare the strongest few (~$1.25 on Opus)
pnpm prepare --profile nare --min 80 --limit 5
# then approve one at http://localhost:3000/review

# 3. The test that de-risks everything else
pnpm submit --confirm --mode handoff
```

Step 3 is the important one. Point it at a real **Greenhouse** posting — its
form is inline, where Ashby's is client-rendered and harder. Handoff cannot
misfire: a visible browser opens with the form filled and a human finishes it.

**Watch what the extractor gets wrong**: which fields it misses, which
selectors fail, whether opener-following reaches the form. That observation is
the input the ATS adapter work needs. Building adapters before seeing a real
form fail is guessing.

Also watch step 2 for drafts that are **discarded**. A few rejections mean the
grounding verifier is working. Many would mean the claim-checks added in the
hardening pass are too strict against real job descriptions — worth knowing
early. The fix would be to loosen the proper-noun check before the numeric one.

---

## Then, in this order

1. ~~**`--max-calls N` on `match`**~~ — done. One budget for the whole
   invocation, shared across profiles, reserved before each call. An
   unparseable value is refused rather than treated as unlimited.
2. **ATS adapters** — the largest remaining unknown. A per-ATS layer in
   `packages/browser/src/ats/` producing `FormField[]`, informed by step 3.
   Greenhouse first. Save real HTML as fixtures; do not test against live
   employer sites.
3. **P2 sweep** — `/setup` route (`getActiveProfile` redirects there and it
   404s on an empty database); pagination in `listJobs` (1171 rows loaded into
   memory per request); `fill.ts`/`submit.ts` duplication (extract one session
   builder); skill aliasing so `GCP` matches `Google Cloud Platform`.

---

## Gotchas you will hit

- **`match` without `--all` only scores jobs that have never been scored.**
  Every posting already carries a deterministic match, so a plain `match` run
  selects zero jobs and exits having done nothing — no error, no cost. Adding
  reasoning to existing matches requires `--all`.
- **A failed model call still consumes `--max-calls`.** The ceiling counts
  attempts, not successes, because a call that fails can still have been
  billed. A run whose calls all fail therefore exhausts its ceiling; the
  remaining jobs are scored deterministically rather than skipped.
- **Only a source that returns its whole catalogue may close a posting.**
  `JobSource.returnsFullCatalogue` says which. Arbeitnow is a rolling feed with
  no last page, so absence from a run means "older than the window", not
  "taken down" — closing on that would kill and revive most of the feed daily.
- **Never validate an aggregator page as a whole.** Three malformed records
  once discarded all 176 good ones on a page. Entries are parsed individually.
- **`.env` does not override an exported shell variable.** Node's
  `loadEnvFile` leaves already-set variables alone, so a stale
  `ANTHROPIC_API_KEY` in the shell silently shadows the file.
- **Restart the dev server after `prisma generate`.** A running Next process
  holds the old client and fails with `Unknown argument` on new columns.
- **`pnpm build` writes `.next` and will clobber a running dev server.**
  That collision produces a 404 stylesheet and an unstyled dashboard. The
  build used to write `.next-build` to avoid it, which meant every
  deployment host looked for `.next` and found nothing. `.next` is now the
  default because hosts require it; use `pnpm --filter @job-bot/web run
  build:isolated` when a dev server is running.
- **`pnpm db:seed` skips profiles that already exist.** The dashboard is where
  profiles are edited now; `pnpm db:seed:force` re-imports from files, and
  `pnpm export` writes the database back out.
- **Discovery fetches unfiltered catalogues on purpose.** Filtering there
  breaks staleness detection — a live posting that fails a keyword filter is
  indistinguishable from one taken down. Relevance is matching's job.
- **`LLM_PROVIDER=none` costs nothing** and still produces full deterministic
  scores. Use it for any verification that does not need reasoning.

---

## Do not change

- The deterministic scorer's ownership of the score.
- Deterministic experience selection before drafting.
- `BrowserAgent.click` refusing submit controls.
- Handoff as the default submit mode; dry-run as the default for `submit`.
- The `human:` actor requirement in `recordHumanDecision` — strengthen it,
  never relax it.
- `submittedAt` being set on any click. It is what makes a duplicate
  impossible; uncertainty about whether the send worked is carried by
  `submissionStatus: UNCONFIRMED` instead.

---

## Known-imperfect, accepted for now

- **`fill`/`submit` have only ever run against `data/test-forms/`.** Real ATS
  forms are multi-step, use custom widgets, and sometimes sit in iframes.
- **Technology extraction is a fixed vocabulary**
  (`data/sources/technologies.json`). Anything absent is invisible to matching.
- **The cover-letter proper-noun check produces false positives** on
  capitalised technical phrases.
- **Prompt caching is wired but likely inert** — the cached prefix is under the
  512-token minimum for the model in use. `cachedInputTokens` on each
  `Match reasoned` log line shows whether it engaged.
- **No tests** for repositories, worker orchestration, or the web layer; no E2E.
- **Data still unconfirmed by its owners**: Arpine's work-authorization notes
  and `requiresSponsorship`, her `yearsOfExperience`, and Nare's
  `salaryMin: 2000` recorded against `salaryPeriod: YEAR` — which will print
  "USD 2,000 per year" onto a form. All editable at `/profile/edit`.

---

## Context for whoever picks this up

Read `README.md` for usage and the matching/grounding design. The
architecture is stable enough that you do not need the build history — start
from the code.
