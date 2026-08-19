"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getApplicationForReview, saveHumanEdits } from "@job-bot/database";
import { applicationAnswersSchema, createLogger } from "@job-bot/shared";

const logger = createLogger("web.review.edit");

/**
 * Applies a reviewer's corrections to generated material.
 *
 * Edited answers keep their recorded `strength` and source slugs: those
 * describe what the profile actually supports, and a human rewording the
 * sentence does not change what the experience database contains. Only the
 * prose is editable here.
 */
export const saveApplicationEdits = async (form: FormData): Promise<void> => {
  const applicationId = String(form.get("applicationId") ?? "");
  const profileSlug = String(form.get("profileSlug") ?? "");
  if (applicationId.length === 0) throw new Error("Missing application id.");

  const application = await getApplicationForReview(applicationId);
  if (!application) throw new Error(`No application ${applicationId}.`);

  const existing = applicationAnswersSchema.safeParse(application.answers);
  const answers = existing.success ? existing.data : [];

  const changed: string[] = [];

  const coverLetterInput = String(form.get("coverLetter") ?? "").trim();
  const coverLetter = coverLetterInput.length === 0 ? null : coverLetterInput;
  if (coverLetter !== application.coverLetter) changed.push("cover letter");

  const editedAnswers = answers.map((answer, index) => {
    const submitted = String(form.get(`answer-${index}`) ?? "").trim();
    if (submitted.length > 0 && submitted !== answer.answer) {
      changed.push(`answer ${index + 1}`);
      return { ...answer, answer: submitted };
    }
    return answer;
  });

  const notesInput = String(form.get("notes") ?? "").trim();

  await saveHumanEdits({
    applicationId,
    coverLetter,
    answers: JSON.parse(JSON.stringify(editedAnswers)),
    notes: notesInput.length === 0 ? null : notesInput,
    actor: "human:dashboard",
    changed,
  });

  logger.info("Materials edited", { applicationId, changed });

  revalidatePath("/review");
  redirect(`/review?profile=${encodeURIComponent(profileSlug)}&edited=${changed.length}`);
};
