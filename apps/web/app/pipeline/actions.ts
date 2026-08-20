"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/actor";
import { prisma, PipelineRunConflictError } from "@job-bot/database";
import { launchPipelineRun } from "@/lib/pipeline-runner";
import { canRunPipeline } from "@/lib/pipeline-capability";

/** Same principal derivation as every other human action in the dashboard. */

const refresh = () => revalidatePath("/");

/** The UI hides these forms on serverless; this backstops a direct POST. */
const assertPipelineAvailable = () => {
  if (!canRunPipeline) {
    throw new Error(
      "This deployment cannot launch pipeline runs. Clone the repository and run the dashboard locally.",
    );
  }
};

/**
 * A lost start race is not an error. Swallowing the conflict and refreshing
 * shows the run that won, which is what the clicker needed to know.
 */
const launchUnlessBusy = async (params: Parameters<typeof launchPipelineRun>[0]) => {
  try {
    await launchPipelineRun(params);
  } catch (error) {
    if (!(error instanceof PipelineRunConflictError)) throw error;
  }
};

export const startDiscovery = async (): Promise<void> => {
  assertPipelineAvailable();
  await launchUnlessBusy({ kind: "DISCOVER", extraArgs: [], startedBy: await currentActor() });
  refresh();
};

export const startMatching = async (formData: FormData): Promise<void> => {
  assertPipelineAvailable();
  const args = ["--all-profiles"];
  // Same default as the CLI: score only jobs with no match yet. Rescoring the
  // whole catalogue is the explicit choice, exactly as --all is.
  if (formData.get("rescoreAll") === "on") args.push("--all");

  const maxCalls = String(formData.get("maxCalls") ?? "").trim();
  if (maxCalls.length > 0) {
    if (!/^\d+$/.test(maxCalls)) throw new Error("Max model calls must be a whole number.");
    args.push("--max-calls", maxCalls);
  }

  await launchUnlessBusy({ kind: "MATCH", extraArgs: args, startedBy: await currentActor() });
  refresh();
};

export const startPreparation = async (formData: FormData): Promise<void> => {
  assertPipelineAvailable();
  const profile = String(formData.get("profile") ?? "").trim();
  if (profile.length === 0) throw new Error("Preparation needs a profile.");

  const min = String(formData.get("min") ?? "").trim();
  const limit = String(formData.get("limit") ?? "").trim();
  if (min.length > 0 && !/^\d+$/.test(min)) throw new Error("Minimum score must be a whole number.");
  if (limit.length > 0 && !/^\d+$/.test(limit)) throw new Error("Limit must be a whole number.");

  const args = ["--profile", profile];
  if (min.length > 0) args.push("--min", min);
  if (limit.length > 0) args.push("--limit", limit);

  await launchUnlessBusy({ kind: "PREPARE", extraArgs: args, startedBy: await currentActor() });
  refresh();
};

/**
 * Fills one approved application's form and opens the browser for the person
 * to finish.
 *
 * Two human actions stand in front of this: the approval recorded on /review,
 * and this click. Even then nothing is sent — the run is handoff mode, where
 * the browser refuses to click submit controls and the final click is made by
 * the person, in the window, or not at all. Auto mode is deliberately not
 * reachable from the dashboard: a button that sends with nobody at the
 * browser stays a typed command.
 */
export const startSubmission = async (formData: FormData): Promise<void> => {
  assertPipelineAvailable();
  const applicationId = String(formData.get("applicationId") ?? "");
  if (applicationId.length === 0) throw new Error("Missing application id.");

  // The worker resolves --application within one profile's queue, so the
  // owning profile must ride along or another profile's default would win.
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { profile: { select: { slug: true } } },
  });

  await launchUnlessBusy({
    kind: "SUBMIT",
    extraArgs: [
      "--profile",
      application.profile.slug,
      "--application",
      applicationId,
      "--mode",
      "handoff",
      "--confirm",
    ],
    startedBy: await currentActor(),
  });

  revalidatePath("/applications");
  refresh();
};
