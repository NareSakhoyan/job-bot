import { listProfiles, prisma, releaseHandoff } from "@job-bot/database";
import { createCallBudget } from "@job-bot/agent";
import { createLogger, loadRootEnv } from "@job-bot/shared";
import { runDiscovery, runMatching } from "./commands";
import { runPreparation } from "./prepare";
import { runFill } from "./fill";
import { runPurge } from "./purge";
import { runListOutcomes, runRecordOutcome, runRecordSent } from "./outcomes";
import { runSubmit, type SubmitMode } from "./submit";
import { exportProfile } from "@job-bot/database";

loadRootEnv();

const logger = createLogger("worker.cli");

const USAGE = `Usage: pnpm --filter @job-bot/worker start <command>

Commands:
  discover                    Search every configured source, deduplicate, persist
  match [--all]               Score jobs that have no match (--all rescores everything)
  run [--all]                 Discover, then match
  prepare [--min <score>]     Generate and verify application material for shortlisted jobs
                                --application <id> | --url <url>  target one posting
  fill [--url <url>]          Fill an application form and stop before submission
  export [--profile <slug>]   Write a profile from the database back to data/profiles/
  purge --source <id>         Remove every job that came from one source
  outcome                     Record what a company decided about an application
                                --application <id> | --url <posting url>
                                --stage <s>     NO_RESPONSE | APPLICATION_REVIEW | RECRUITER_SCREEN
                                                | TECHNICAL_SCREEN | INTERVIEW_LOOP | FINAL_ROUND | OFFER_STAGE
                                --result <r>    REJECTED | GHOSTED | WITHDRAWN | OFFER | ONGOING
                                --note "..."    exactly what they said, unedited
                                --via <how>     email, portal, call
                                --at <date>     when they decided (default: today)
  outcomes [--profile <slug>] Show recorded outcomes and the reason tally
  sent --application <id>     Record that you submitted it yourself in the browser
  release --application <id>  Return a handed-off application to the queue after
                                you closed the browser without submitting
  submit [--mode <m>]         Send an approved application. Dry run unless --confirm.
                                --mode handoff  fill it and let you click submit (default)
                                --mode auto     fill it and click submit for you
                                --confirm       actually do it
                                --limit <n>     ceiling per run (default 1)

Options:
  --profile <slug>            Which CV to match against (default: the first profile)
  --all-profiles              Match every profile in turn
  --min-reason <score>        Skip model reasoning below this score (default 45)
  --max-calls <n>             Hard ceiling on model calls for the whole run
  --concurrency <n>           Jobs matched in parallel (default 6)

Nothing in this worker submits an application.`;

const readOption = (flags: string[], name: string): string | null => {
  const index = flags.indexOf(name);
  return index >= 0 ? (flags[index + 1] ?? null) : null;
};

const matchProfiles = async (flags: string[], rescoreAll: boolean) => {
  /**
   * Reads a numeric flag, refusing anything unparseable.
   *
   * A silent fallback would be wrong here: `--max-calls` exists to bound
   * spend, and `--max-calls` with a typo'd or missing value quietly meaning
   * "unlimited" is the exact failure the flag is there to prevent.
   */
  const numeric = (name: string): number | undefined => {
    if (!flags.includes(name)) return undefined;
    const raw = readOption(flags, name);
    const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${name} needs a whole number, received ${raw ?? "nothing"}`);
    }
    return parsed;
  };

  const maxCalls = numeric("--max-calls");

  const shared = {
    rescoreAll,
    reasoningThreshold: numeric("--min-reason"),
    concurrency: numeric("--concurrency"),
    // One budget for the whole invocation, so --all-profiles cannot multiply
    // the ceiling by the number of CVs.
    callBudget: maxCalls === undefined ? undefined : createCallBudget(maxCalls),
  };

  if (!flags.includes("--all-profiles")) {
    await runMatching({ ...shared, profileSlug: readOption(flags, "--profile") });
    return;
  }

  for (const profile of await listProfiles()) {
    await runMatching({ ...shared, profileSlug: profile.slug });
  }
};

const main = async () => {
  const [command = "", ...flags] = process.argv.slice(2);
  const rescoreAll = flags.includes("--all");

  switch (command) {
    case "discover":
      await runDiscovery();
      break;
    case "match":
      await matchProfiles(flags, rescoreAll);
      break;
    case "run":
      await runDiscovery();
      await matchProfiles(flags, rescoreAll);
      break;
    case "prepare": {
      const min = readOption(flags, "--min");
      const take = readOption(flags, "--limit");
      await runPreparation({
        profileSlug: readOption(flags, "--profile"),
        minScore: min === null ? undefined : Number.parseInt(min, 10),
        limit: take === null ? undefined : Number.parseInt(take, 10),
        applicationId: readOption(flags, "--application"),
        url: readOption(flags, "--url"),
      });
      break;
    }
    case "fill":
      await runFill({
        profileSlug: readOption(flags, "--profile"),
        url: readOption(flags, "--url"),
        applicationId: readOption(flags, "--application"),
        headless: !flags.includes("--headed"),
      });
      break;
    case "export": {
      const requested = readOption(flags, "--profile");
      const targets = requested
        ? [requested]
        : (await listProfiles()).map((profile) => profile.slug);
      for (const target of targets) {
        const written = await exportProfile(target);
        console.log(`${target}: wrote ${written.length} files`);
      }
      break;
    }
    case "purge": {
      const source = readOption(flags, "--source");
      if (source === null) {
        console.log("purge requires --source <id>, e.g. --source mock");
        process.exitCode = 1;
        break;
      }
      const result = await runPurge(source);
      console.log(`${result.source}: removed ${result.removed} jobs`);
      break;
    }
    case "outcome": {
      const stage = readOption(flags, "--stage");
      const result = readOption(flags, "--result");
      if (stage === null || result === null) {
        throw new Error("outcome requires --stage and --result. Run with no command for the list.");
      }
      await runRecordOutcome({
        applicationId: readOption(flags, "--application"),
        url: readOption(flags, "--url"),
        profileSlug: readOption(flags, "--profile"),
        stage,
        result,
        note: readOption(flags, "--note"),
        learnedVia: readOption(flags, "--via"),
        decidedAt: readOption(flags, "--at"),
        // Outcomes are facts a person observed, so the actor is a person.
        recordedBy: `human:${readOption(flags, "--by") ?? "operator"}`,
      });
      break;
    }
    case "sent": {
      const id = readOption(flags, "--application");
      if (id === null) throw new Error("sent requires --application <id>");
      await runRecordSent({
        applicationId: id,
        recordedBy: `human:${readOption(flags, "--by") ?? "operator"}`,
        note: readOption(flags, "--note"),
      });
      console.log("Recorded as submitted. It can no longer be sent again.");
      break;
    }
    case "release": {
      const id = readOption(flags, "--application");
      if (id === null) throw new Error("release requires --application <id>");
      await releaseHandoff({
        applicationId: id,
        actor: `human:${readOption(flags, "--by") ?? "operator"}`,
        reason: readOption(flags, "--reason") ?? undefined,
      });
      console.log("Returned to the submission queue.");
      break;
    }
    case "outcomes":
      await runListOutcomes(readOption(flags, "--profile"));
      break;
    case "submit": {
      const rawMode = readOption(flags, "--mode");
      const mode: SubmitMode = rawMode === "auto" ? "auto" : "handoff";
      const rawLimit = readOption(flags, "--limit");

      const result = await runSubmit({
        profileSlug: readOption(flags, "--profile"),
        applicationId: readOption(flags, "--application"),
        url: readOption(flags, "--url"),
        mode,
        confirm: flags.includes("--confirm"),
        limit: rawLimit === null ? undefined : Number.parseInt(rawLimit, 10),
      });

      console.log(
        result.dryRun
          ? "Dry run: nothing was sent. Add --confirm to send."
          : `Attempted ${result.attempted}: submitted ${result.submitted} (${result.unconfirmed} unconfirmed), handed off ${result.handedOff}, failed ${result.failed}.`,
      );
      break;
    }
    default:
      console.log(USAGE);
      process.exitCode = command === "" ? 0 : 1;
  }
};

main()
  .catch((error: unknown) => {
    logger.error("Worker failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
