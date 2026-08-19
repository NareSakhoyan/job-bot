"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
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

  // Whoever authenticated is recorded alongside the decision. With Basic auth
  // configured this is a real principal; without it, it is at least the origin
  // the request came from.
  const requestHeaders = await headers();
  const authorization = requestHeaders.get("authorization") ?? "";
  const principal =
    authorization.startsWith("Basic ")
      ? Buffer.from(authorization.slice(6), "base64").toString("utf8").split(":")[0] || "dashboard"
      : "dashboard";

  const origin = requestHeaders.get("x-forwarded-for") ?? requestHeaders.get("host") ?? null;

  await recordHumanDecision({
    applicationId,
    decision,
    actor: `human:${principal}`,
    note: note.length === 0 ? null : note,
    origin,
  });

  logger.info("Human decision recorded", { applicationId, decision, principal, origin });

  revalidatePath("/review");
  revalidatePath("/applications");
};
