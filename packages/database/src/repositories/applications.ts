import type { Prisma } from "@prisma/client";
import type { ApplicationStatus } from "@prisma/client";
import { prisma } from "../client";

export const listApplications = async (profileId: string) =>
  prisma.application.findMany({
    where: { profileId },
    // The outcome comes along so the dashboard can tell a sent application
    // that is still waiting on the company from one nobody has followed up.
    include: { job: { include: { matches: { where: { profileId } } } }, outcome: true },
    orderBy: [{ updatedAt: "desc" }],
  });

/**
 * Creates the application row that tracks a job through the pipeline for one
 * profile, together with its first audit event. Safe to call repeatedly.
 */
export const ensureApplication = async (profileId: string, jobId: string, actor: string) => {
  const existing = await prisma.application.findUnique({
    where: { profileId_jobId: { profileId, jobId } },
  });
  if (existing) return existing;

  return prisma.application.create({
    data: {
      profileId,
      jobId,
      status: "DISCOVERED",
      events: {
        create: {
          type: "STATUS_CHANGED",
          toStatus: "DISCOVERED",
          actor,
          message: "Job discovered and added to the pipeline",
        },
      },
    },
  });
};

/**
 * The only supported way to move an application through the pipeline. Every
 * transition writes an audit event, so status history is never lost.
 */
export const transitionApplication = async (params: {
  applicationId: string;
  toStatus: ApplicationStatus;
  actor: string;
  message: string;
  metadata?: Record<string, unknown>;
}) => {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: params.applicationId },
  });

  if (application.status === params.toStatus) return application;

  return prisma.application.update({
    where: { id: params.applicationId },
    data: {
      status: params.toStatus,
      events: {
        create: {
          type: "STATUS_CHANGED",
          fromStatus: application.status,
          toStatus: params.toStatus,
          actor: params.actor,
          message: params.message,
          metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
        },
      },
    },
  });
};

export type ApplicationListItem = Awaited<ReturnType<typeof listApplications>>[number];

/**
 * Stores generated material and moves the application to review. Nothing here
 * approves or submits anything — READY_FOR_REVIEW is as far as the agent can
 * take an application on its own.
 */
export const saveApplicationMaterials = async (params: {
  applicationId: string;
  tailoredResume: Prisma.InputJsonValue | null;
  coverLetter: string | null;
  answers: Prisma.InputJsonValue | null;
  actor: string;
  notes: string | null;
}) => {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: params.applicationId },
  });

  return prisma.application.update({
    where: { id: params.applicationId },
    data: {
      tailoredResume: params.tailoredResume ?? undefined,
      coverLetter: params.coverLetter,
      answers: params.answers ?? undefined,
      notes: params.notes,
      status: "READY_FOR_REVIEW",
      readyAt: new Date(),
      events: {
        create: {
          type: "MATERIALS_GENERATED",
          fromStatus: application.status,
          toStatus: "READY_FOR_REVIEW",
          actor: params.actor,
          message: "Tailored materials generated and verified against the profile",
        },
      },
    },
  });
};

/** Applications a human has been asked to review. */
export const listApplicationsForReview = async (profileId: string) =>
  prisma.application.findMany({
    where: { profileId, status: "READY_FOR_REVIEW" },
    include: { job: { include: { matches: { where: { profileId } } } } },
    orderBy: [{ readyAt: "desc" }],
  });

/**
 * Records an explicit human decision. Approval is the only path past
 * READY_FOR_REVIEW, and `approvedBy` records who gave it.
 */
export const recordHumanDecision = async (params: {
  applicationId: string;
  decision: "APPROVED" | "REJECTED";
  /** Must identify a person, e.g. "human:dashboard". */
  actor: string;
  note: string | null;
  /** Where the decision came from, kept for the audit trail. */
  origin?: string | null;
}) => {
  // The invariant lives here rather than only at the call site: an approval is
  // the sole thing that makes an application submittable, so no future caller
  // should be able to record an agent-made one by passing a different string.
  if (!params.actor.startsWith("human:")) {
    throw new Error(
      `Refusing to record a decision attributed to "${params.actor}": approvals must come from a human actor.`,
    );
  }

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: params.applicationId },
  });

  if (application.status !== "READY_FOR_REVIEW") {
    throw new Error(
      `Application ${params.applicationId} is ${application.status}, not READY_FOR_REVIEW; there is nothing to decide.`,
    );
  }

  return prisma.application.update({
    where: { id: params.applicationId },
    data: {
      status: params.decision,
      approvedAt: params.decision === "APPROVED" ? new Date() : null,
      approvedBy: params.decision === "APPROVED" ? params.actor : null,
      submissionStatus: params.decision === "APPROVED" ? "AWAITING_APPROVAL" : "NOT_STARTED",
      notes: params.note ?? application.notes,
      events: {
        create: {
          type: "HUMAN_DECISION",
          fromStatus: application.status,
          toStatus: params.decision,
          actor: params.actor,
          message:
            params.decision === "APPROVED"
              ? "Approved by a human. Submission still requires a separate explicit action."
              : "Rejected by a human.",
          metadata: {
            ...(params.note ? { note: params.note } : {}),
            ...(params.origin ? { origin: params.origin } : {}),
          },
        },
      },
    },
  });
};

export type ReviewApplication = Awaited<ReturnType<typeof listApplicationsForReview>>[number];

/**
 * Saves human edits to generated material.
 *
 * A reviewer must be able to correct wording without regenerating everything,
 * so the edit is applied in place and recorded as its own audit event. The
 * status is untouched: editing is not approving.
 */
export const saveHumanEdits = async (params: {
  applicationId: string;
  coverLetter: string | null;
  answers: Prisma.InputJsonValue;
  notes: string | null;
  actor: string;
  changed: string[];
}) => {
  const application = await prisma.application.update({
    where: { id: params.applicationId },
    data: {
      coverLetter: params.coverLetter,
      answers: params.answers,
      notes: params.notes,
      events: {
        create: {
          type: "MATERIALS_EDITED",
          actor: params.actor,
          message:
            params.changed.length === 0
              ? "Reviewed with no changes"
              : `Edited by hand: ${params.changed.join(", ")}`,
          metadata: { changed: params.changed },
        },
      },
    },
  });

  return application;
};

export const getApplicationForReview = async (id: string) =>
  prisma.application.findUnique({ where: { id }, include: { job: true } });

/**
 * Claims an application for a submission run.
 *
 * The check-then-act in `markSubmitted` alone is not enough: two runs can both
 * read `submittedAt: null` before either writes. This is a conditional update,
 * so exactly one caller can win, and a run that dies after claiming leaves a
 * visible IN_PROGRESS row rather than one that looks eligible again.
 */
export const claimForSubmission = async (applicationId: string): Promise<boolean> => {
  const claimed = await prisma.application.updateMany({
    where: {
      id: applicationId,
      status: "APPROVED",
      submittedAt: null,
      submissionStatus: { notIn: ["IN_PROGRESS", "SUBMITTED", "UNCONFIRMED"] },
    },
    data: { submissionStatus: "IN_PROGRESS" },
  });

  return claimed.count === 1;
};

/**
 * Records that an application was actually sent.
 *
 * `submittedAt` is set once and is what makes a second submission impossible:
 * the authorization check reads it, and the update below refuses to run twice.
 * The evidence — final URL, any confirmation text, screenshots — is written to
 * the audit log, because "did this really go through" is the question you will
 * ask later and a status flag alone cannot answer it.
 */
export const markSubmitted = async (params: {
  applicationId: string;
  actor: string;
  url: string;
  confirmationText: string | null;
  screenshots: Array<string | null>;
  mode: "auto" | "handoff" | "manual";
}) => {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: params.applicationId },
  });

  if (application.submittedAt !== null) {
    throw new Error(
      `Application ${params.applicationId} was already submitted at ${application.submittedAt.toISOString()}.`,
    );
  }

  // A click cannot be taken back, so `submittedAt` is set whether or not the
  // page acknowledged it. Leaving it null to signal "unconfirmed" would make
  // the application eligible again and risk a duplicate — the worse failure.
  // The uncertainty is carried by submissionStatus instead.
  const confirmed = params.confirmationText !== null || params.mode === "manual";

  const updated = await prisma.application.updateMany({
    where: { id: params.applicationId, submittedAt: null },
    data: {
      status: "SUBMITTED",
      submissionStatus: confirmed ? "SUBMITTED" : "UNCONFIRMED",
      submittedAt: new Date(),
    },
  });

  if (updated.count !== 1) {
    throw new Error(
      `Application ${params.applicationId} was submitted concurrently; this run did not win the claim.`,
    );
  }

  return prisma.application.update({
    where: { id: params.applicationId },
    data: {
      events: {
        create: {
          type: "SUBMITTED",
          fromStatus: application.status,
          toStatus: "SUBMITTED",
          actor: params.actor,
          message:
            params.confirmationText === null
              ? `Submitted via ${params.mode}; the page returned no confirmation text — verify by hand.`
              : `Submitted via ${params.mode}; the page confirmed: "${params.confirmationText}"`,
          metadata: {
            url: params.url,
            confirmationText: params.confirmationText,
            screenshots: params.screenshots.filter((path): path is string => path !== null),
            mode: params.mode,
          },
        },
      },
    },
  });
};

/** Records that the form was filled and handed to a person to finish. */
export const markHandedOff = async (params: {
  applicationId: string;
  actor: string;
  url: string;
  unfilledRequired: string[];
}) => {
  return prisma.application.update({
    where: { id: params.applicationId },
    data: {
      submissionStatus: "HANDED_OFF",
      events: {
        create: {
          type: "HANDED_OFF",
          actor: params.actor,
          message:
            params.unfilledRequired.length === 0
              ? "Form filled and opened for you to review and submit."
              : `Form filled and opened for you; ${params.unfilledRequired.length} required field(s) still need you: ${params.unfilledRequired.join(", ")}.`,
          metadata: { url: params.url, unfilledRequired: params.unfilledRequired },
        },
      },
    },
  });
};

/** Records that a submission attempt failed, leaving it retryable. */
export const markSubmissionFailed = async (params: {
  applicationId: string;
  actor: string;
  reason: string;
}) => {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: params.applicationId },
  });

  return prisma.application.update({
    where: { id: params.applicationId },
    data: {
      // The status stays APPROVED so it can be retried once the cause is fixed.
      submissionStatus: "FAILED",
      events: {
        create: {
          type: "SUBMISSION_FAILED",
          fromStatus: application.status,
          actor: params.actor,
          message: params.reason,
        },
      },
    },
  });
};

/** Applications a human approved and that have not been sent. */
export const listApprovedForSubmission = async (profileId: string) =>
  prisma.application.findMany({
    where: {
      profileId,
      status: "APPROVED",
      submittedAt: null,
      // A claimed row belongs to another run; a handed-off one is with a human.
      submissionStatus: { notIn: ["IN_PROGRESS", "HANDED_OFF"] },
      job: { closedAt: null },
    },
    include: { job: true },
    orderBy: [{ approvedAt: "asc" }],
  });

/**
 * Returns a handed-off application to the submission queue.
 *
 * Handoff parks an application because a person has the filled form open in a
 * browser, and re-opening it while they work would risk a duplicate. But
 * closing that window without submitting leaves no signal, so the application
 * sits out of the queue forever and `submit` silently reports nothing to do —
 * which is exactly what happened the first time a real handoff was abandoned.
 *
 * The guard that matters is `submittedAt`. Once anything has been clicked, the
 * send may have landed, and no amount of certainty from a person outweighs
 * that: releasing then could produce a second application. Uncertainty about
 * whether a click worked belongs in `submissionStatus: UNCONFIRMED`, never in
 * a fresh attempt.
 */
export const releaseHandoff = async (params: { applicationId: string; actor: string; reason?: string }) => {
  const application = await prisma.application.findUnique({
    where: { id: params.applicationId },
    select: { id: true, submittedAt: true, submissionStatus: true },
  });

  if (!application) throw new Error(`No application ${params.applicationId}`);

  if (application.submittedAt !== null) {
    throw new Error(
      "This application has already been sent. Releasing it could produce a duplicate; record an outcome instead.",
    );
  }

  if (application.submissionStatus !== "HANDED_OFF") {
    throw new Error(
      `Only a handed-off application can be released; this one is ${application.submissionStatus}.`,
    );
  }

  return prisma.application.update({
    where: { id: params.applicationId },
    data: {
      submissionStatus: "NOT_STARTED",
      events: {
        create: {
          type: "HANDOFF_RELEASED",
          actor: params.actor,
          message: params.reason ?? "Handoff abandoned without submitting; returned to the queue.",
        },
      },
    },
  });
};

/**
 * Applications waiting on a person rather than on the pipeline.
 *
 * Two states qualify. A handed-off application has a filled form open in a
 * browser the tool stopped watching, and only the person there knows whether
 * they sent it. A submitted application with no recorded outcome is waiting
 * for the company's answer, which likewise only reaches a person.
 *
 * Both were previously resolvable only from the terminal, which meant the
 * dashboard showed a pipeline it could not act on.
 */
export const listApplicationsAwaitingHuman = async (profileId: string) =>
  prisma.application.findMany({
    where: {
      profileId,
      OR: [{ submissionStatus: "HANDED_OFF" }, { submittedAt: { not: null }, outcome: { is: null } }],
    },
    include: { job: { select: { company: true, title: true, url: true } }, outcome: true },
    orderBy: [{ updatedAt: "desc" }],
  });
