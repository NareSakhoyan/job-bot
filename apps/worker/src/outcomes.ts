import {
  countRejectionReasons,
  listOutcomes,
  markSubmitted,
  prisma,
  recordOutcome,
  resolveProfile,
  type OutcomeResult,
  type OutcomeStage,
} from "@job-bot/database";
import { classifyRejectionFeedback } from "@job-bot/matching";
import { createLogger, isCandidateSignal, OUTCOME_RESULTS, OUTCOME_STAGES } from "@job-bot/shared";

const logger = createLogger("worker.outcome");

export interface RecordOutcomeOptions {
  applicationId?: string | null;
  /** The posting URL, as an alternative to knowing the application id. */
  url?: string | null;
  profileSlug?: string | null;
  stage: string;
  result: string;
  /** Exactly what the company said. */
  note?: string | null;
  learnedVia?: string | null;
  decidedAt?: string | null;
  recordedBy: string;
}

const parseEnum = <T extends readonly string[]>(name: string, value: string, allowed: T): T[number] => {
  const upper = value.toUpperCase();
  if (!allowed.includes(upper)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")} — received "${value}"`);
  }
  return upper;
};

/**
 * Records what a company decided, classifying its wording into objective codes.
 *
 * The verbatim text is stored untouched. Only the codes are machine-readable,
 * and the classifier only ever chooses from a closed vocabulary — so recording
 * an outcome can never quietly rewrite how matching scores anything.
 */
export const runRecordOutcome = async (options: RecordOutcomeOptions) => {
  const stage = parseEnum("--stage", options.stage, OUTCOME_STAGES) as OutcomeStage;
  const result = parseEnum("--result", options.result, OUTCOME_RESULTS) as OutcomeResult;

  const application = options.applicationId
    ? await prisma.application.findUnique({
        where: { id: options.applicationId },
        include: { job: { select: { company: true, title: true } } },
      })
    : await prisma.application.findFirst({
        where: {
          job: options.url ? { url: options.url } : undefined,
          profile: options.profileSlug ? { slug: options.profileSlug } : undefined,
        },
        include: { job: { select: { company: true, title: true } } },
        orderBy: { updatedAt: "desc" },
      });

  if (!application) {
    throw new Error("No application matched. Pass --application <id> or --url <posting url>.");
  }

  const classified = classifyRejectionFeedback(options.note ?? null);

  const outcome = await recordOutcome({
    applicationId: application.id,
    stage,
    result,
    verbatim: options.note ?? null,
    reasons: classified.reasons,
    learnedVia: options.learnedVia ?? null,
    recordedBy: options.recordedBy,
    decidedAt: options.decidedAt ? new Date(options.decidedAt) : new Date(),
  });

  logger.info("Outcome recorded", {
    company: application.job.company,
    title: application.job.title,
    stage,
    result,
    reasons: classified.reasons,
    unclassified: classified.unclassified,
  });

  if (classified.unclassified && (options.note ?? "").trim().length > 0) {
    logger.warn("No objective reason could be read from the wording; stored as NO_REASON_GIVEN", {
      verbatim: (options.note ?? "").slice(0, 160),
    });
  }

  return outcome;
};

/** Prints recorded outcomes and the reason tally they add up to. */
export const runListOutcomes = async (profileSlug?: string | null) => {
  const profile = await resolveProfile(profileSlug);
  if (!profile) throw new Error("No profile found.");

  const outcomes = await listOutcomes(profile.id);
  if (outcomes.length === 0) {
    console.log(`${profile.slug}: no outcomes recorded yet.`);
    return;
  }

  for (const outcome of outcomes) {
    const date = outcome.decidedAt.toISOString().slice(0, 10);
    console.log(
      `${date}  ${outcome.result.padEnd(9)} ${outcome.stage.padEnd(18)} ${outcome.application.job.company} — ${outcome.application.job.title}`,
    );
    if (outcome.reasons.length > 0) console.log(`            ${outcome.reasons.join(", ")}`);
  }

  const counts = await countRejectionReasons(profile.id);
  const actionable = Object.entries(counts)
    .filter(([reason]) => isCandidateSignal(reason as never))
    .sort((a, b) => b[1] - a[1]);

  console.log(`\n${profile.slug}: ${outcomes.length} outcomes recorded.`);
  if (actionable.length > 0) {
    console.log("Reasons that say something about the candidate:");
    for (const [reason, count] of actionable) console.log(`  ${String(count).padStart(3)}  ${reason}`);
  }
};

/**
 * Records that a person sent an application by hand.
 *
 * Handoff is the default mode, and it ends with a filled form in a browser
 * window that the tool no longer watches. If the person submits there, nothing
 * writes it down: `submittedAt` stays null and the application sits at
 * HANDED_OFF. That is safe by accident — the queue skips handed-off rows — but
 * it stops being safe the moment the row is released, at which point the
 * system would cheerfully send a second application.
 *
 * `markSubmitted` refuses if `submittedAt` is already set, so this cannot
 * overwrite a real send with a guess.
 */
export const runRecordSent = async (options: {
  applicationId: string;
  recordedBy: string;
  note?: string | null;
}) => {
  const application = await prisma.application.findUnique({
    where: { id: options.applicationId },
    include: { job: { select: { company: true, title: true, url: true } } },
  });
  if (!application) throw new Error(`No application ${options.applicationId}`);

  await markSubmitted({
    applicationId: application.id,
    actor: options.recordedBy,
    url: application.job.url,
    // A person watched it land, which is stronger evidence than any scrape.
    confirmationText: options.note ?? "Submitted by hand from the handed-off browser window.",
    screenshots: [],
    mode: "manual",
  });

  logger.info("Recorded as sent by hand", {
    company: application.job.company,
    title: application.job.title,
  });
};
