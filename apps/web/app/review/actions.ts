"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/actor";
import { recordHumanDecision } from "@job-bot/database";
import { createLogger } from "@job-bot/shared";

const logger = createLogger("web.review");

/**
 * The only path past READY_FOR_REVIEW.
 *
 * Approving records the decision and moves the application to APPROVED with
 * submission AWAITING_APPROVAL. It does not submit anything: there is no code
 * path in this system that sends an application, and adding one is a separate,
 * deliberate step.
 */
export const decideApplication = async (formData: FormData): Promise<void> => {
  const applicationId = String(formData.get("applicationId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (applicationId.length === 0) throw new Error("Missing application id.");
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    throw new Error(`Unsupported decision "${decision}".`);
  }

  // The signed-in Clerk user, and where the request came from. Approval is the
  // decision that makes an application eligible to be sent, so it is the one
  // most worth being able to attribute later.
  const actor = await currentActor();
  const requestHeaders = await headers();
  const origin = requestHeaders.get("x-forwarded-for") ?? requestHeaders.get("host") ?? null;

  await recordHumanDecision({
    applicationId,
    decision,
    actor,
    note: note.length === 0 ? null : note,
    origin,
  });

  logger.info("Human decision recorded", { applicationId, decision, actor, origin });

  revalidatePath("/review");
  revalidatePath("/applications");
};
