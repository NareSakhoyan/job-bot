"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/actor";
import {
  ensureApplication,
  markSubmitted,
  prisma,
  recordExternalJob,
  recordOutcome,
  releaseHandoff,
  transitionApplication,
  type ApplicationStatus,
  type OutcomeResult,
  type OutcomeStage,
} from "@job-bot/database";
import { classifyRejectionFeedback } from "@job-bot/matching";
import { SETTABLE_STATUSES } from "@/lib/settable-statuses";
import { createLogger } from "@job-bot/shared";

const logger = createLogger("web.applications");


const refresh = () => {
  revalidatePath("/applications");
  revalidatePath("/review");
};

const requireId = (formData: FormData): string => {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (applicationId.length === 0) throw new Error("Missing application id.");
  return applicationId;
};

/**
 * Records that a person submitted a handed-off application themselves.
 *
 * Handoff ends with a filled form in a browser the tool no longer watches, so
 * without this the send is invisible: `submittedAt` stays null and the row
 * could be released back into the queue and sent twice.
 */
export const markSentByHand = async (formData: FormData): Promise<void> => {
  const applicationId = requireId(formData);
  const note = String(formData.get("note") ?? "").trim();

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { job: { select: { url: true, company: true } } },
  });

  await markSubmitted({
    applicationId,
    actor: await currentActor(),
    url: application.job.url,
    confirmationText: note.length > 0 ? note : "Submitted by hand from the handed-off window.",
    screenshots: [],
    // A person watched it land, which is better evidence than any scrape.
    mode: "manual",
  });

  logger.info("Recorded as sent by hand", { applicationId, company: application.job.company });
  refresh();
};

/** Returns a handed-off application to the queue when the window was closed unsent. */
export const releaseHandoffAction = async (formData: FormData): Promise<void> => {
  const applicationId = requireId(formData);

  await releaseHandoff({
    applicationId,
    actor: await currentActor(),
    reason: "Closed without submitting; returned to the queue from the dashboard.",
  });

  logger.info("Handoff released", { applicationId });
  refresh();
};

/**
 * Records what a company decided.
 *
 * The verbatim wording is stored untouched and never scored; only the codes
 * the classifier reads out of it are machine-readable, so no single
 * recruiter's phrasing can move the scorer.
 */
export const recordOutcomeAction = async (formData: FormData): Promise<void> => {
  const applicationId = requireId(formData);
  const stage = String(formData.get("stage") ?? "") as OutcomeStage;
  const result = String(formData.get("result") ?? "") as OutcomeResult;
  const verbatim = String(formData.get("verbatim") ?? "").trim();

  if (!stage || !result) throw new Error("Both a stage and a result are required.");

  const classified = classifyRejectionFeedback(verbatim.length === 0 ? null : verbatim);

  await recordOutcome({
    applicationId,
    stage,
    result,
    verbatim: verbatim.length === 0 ? null : verbatim,
    reasons: classified.reasons,
    learnedVia: String(formData.get("learnedVia") ?? "").trim() || null,
    recordedBy: await currentActor(),
    decidedAt: new Date(),
  });

  logger.info("Outcome recorded", { applicationId, stage, result, reasons: classified.reasons });
  refresh();
};


/** Moves an application by hand, recording who did it and why. */
export const setApplicationStatus = async (formData: FormData): Promise<void> => {
  const applicationId = requireId(formData);
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!(SETTABLE_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`"${status}" is not a status you can set by hand.`);
  }

  await transitionApplication({
    applicationId,
    toStatus: status as ApplicationStatus,
    actor: await currentActor(),
    message: note.length > 0 ? note : "Status set by hand from the dashboard.",
  });

  logger.info("Status set by hand", { applicationId, status });
  refresh();
  revalidatePath("/jobs");
};

/**
 * Records an application sent outside this tool entirely.
 *
 * Distinct from `markSentByHand`, which resolves a handoff this system
 * started. Here nothing was ever filled or claimed — a person found the job
 * and applied on the company's own site. What matters is the same either way:
 * stamping `submittedAt` so the pipeline can never send a second one.
 *
 * The application row may not exist yet if the job was never matched, so it is
 * created on demand.
 */
export const markAppliedByHand = async (formData: FormData): Promise<void> => {
  const jobId = String(formData.get("jobId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (jobId.length === 0 || profileId.length === 0) throw new Error("Missing job or profile.");

  const actor = await currentActor();
  const application = await ensureApplication(profileId, jobId, actor);
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { url: true } });

  await markSubmitted({
    applicationId: application.id,
    actor,
    url: job.url,
    confirmationText:
      note.length > 0 ? note : "Applied directly on the company's site, outside this tool.",
    screenshots: [],
    mode: "manual",
  });

  logger.info("Recorded an application made outside the tool", { jobId, applicationId: application.id });
  refresh();
  revalidatePath("/jobs");
};

/**
 * Records an application to a job this system never discovered.
 *
 * Referrals, LinkedIn, agencies, companies on no ATS we track — most of a real
 * search happens outside the catalogue, and until now none of it could be
 * recorded. That biased the outcome loop toward the small slice of
 * applications the pipeline found for itself.
 */
export const recordExternalApplication = async (formData: FormData): Promise<void> => {
  const profileId = String(formData.get("profileId") ?? "");
  const company = String(formData.get("company") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (profileId.length === 0) throw new Error("Missing profile.");
  if (company.length === 0 || title.length === 0) {
    throw new Error("A company and a title are required.");
  }

  const actor = await currentActor();
  const job = await recordExternalJob({ company, title, url });
  const application = await ensureApplication(profileId, job.id, actor);

  await markSubmitted({
    applicationId: application.id,
    actor,
    url: job.url,
    confirmationText: note.length > 0 ? note : "Applied outside this tool; recorded by hand.",
    screenshots: [],
    mode: "manual",
  });

  logger.info("External application recorded", { company, title, applicationId: application.id });
  refresh();
  revalidatePath("/jobs");
};
