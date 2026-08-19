import type { OutcomeResult, OutcomeStage, RejectionReason } from "@prisma/client";
import { prisma } from "../client";
import { transitionApplication } from "./applications";

export interface RecordOutcomeInput {
  applicationId: string;
  stage: OutcomeStage;
  result: OutcomeResult;
  /** Exactly what the company said. Stored unedited, never scored. */
  verbatim?: string | null;
  /** Objective codes, classified by the caller from `verbatim`. */
  reasons: RejectionReason[];
  /** Email, portal, recruiter call — how this was learned. */
  learnedVia?: string | null;
  recordedBy: string;
  decidedAt: Date;
}

/** Where an application lands once its outcome is known. */
const STATUS_FOR_RESULT = {
  REJECTED: "REJECTED_BY_COMPANY",
  GHOSTED: "REJECTED_BY_COMPANY",
  WITHDRAWN: "WITHDRAWN",
  OFFER: "INTERVIEW",
  ONGOING: "INTERVIEW",
} as const;

/**
 * Records what happened to an application, and moves it to match.
 *
 * Upserts rather than appends: an application has one current outcome, and a
 * rejection that arrives after an interview replaces the interview record. The
 * append-only history of how it got there lives in ApplicationEvent, which
 * this writes to as well, so nothing is lost by overwriting.
 */
export const recordOutcome = async (input: RecordOutcomeInput) => {
  const data = {
    stage: input.stage,
    result: input.result,
    verbatim: input.verbatim ?? null,
    reasons: input.reasons,
    learnedVia: input.learnedVia ?? null,
    recordedBy: input.recordedBy,
    decidedAt: input.decidedAt,
  };

  const outcome = await prisma.applicationOutcome.upsert({
    where: { applicationId: input.applicationId },
    create: { applicationId: input.applicationId, ...data },
    update: data,
  });

  await transitionApplication({
    applicationId: input.applicationId,
    toStatus: STATUS_FOR_RESULT[input.result],
    actor: input.recordedBy,
    message: `Outcome recorded: ${input.result} at ${input.stage}${
      input.reasons.length > 0 ? ` (${input.reasons.join(", ")})` : ""
    }`,
    metadata: { reasons: input.reasons, learnedVia: input.learnedVia ?? null },
  });

  return outcome;
};

/** Every recorded outcome for a profile, newest decision first. */
export const listOutcomes = async (profileId: string) =>
  prisma.applicationOutcome.findMany({
    where: { application: { profileId } },
    orderBy: { decidedAt: "desc" },
    include: {
      application: { include: { job: { select: { company: true, title: true, url: true } } } },
    },
  });

/**
 * How often each objective reason has been recorded for a profile.
 *
 * The input to any future tailoring: a reason seen once is an anecdote, the
 * same reason seen repeatedly is a pattern worth acting on.
 */
export const countRejectionReasons = async (profileId: string): Promise<Record<string, number>> => {
  const outcomes = await prisma.applicationOutcome.findMany({
    where: { application: { profileId } },
    select: { reasons: true },
  });

  const counts: Record<string, number> = {};
  for (const outcome of outcomes) {
    for (const reason of outcome.reasons) counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
};
