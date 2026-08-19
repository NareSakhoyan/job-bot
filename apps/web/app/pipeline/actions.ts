"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@job-bot/database";
import { launchPipelineRun } from "@/lib/pipeline-runner";

/** Same principal derivation as every other human action in the dashboard. */
const principalFromRequest = async (): Promise<string> => {
  const requestHeaders = await headers();
  const authorization = requestHeaders.get("authorization") ?? "";
  const name = authorization.startsWith("Basic ")
    ? Buffer.from(authorization.slice(6), "base64").toString("utf8").split(":")[0] || "dashboard"
    : "dashboard";
  return `human:${name}`;
};

const refresh = () => revalidatePath("/");

export const startDiscovery = async (): Promise<void> => {
  await launchPipelineRun({ kind: "DISCOVER", extraArgs: [], startedBy: await principalFromRequest() });
  refresh();
};

export const startMatching = async (formData: FormData): Promise<void> => {
  const args = ["--all-profiles"];
  // Same default as the CLI: score only jobs with no match yet. Rescoring the
  // whole catalogue is the explicit choice, exactly as --all is.
  if (formData.get("rescoreAll") === "on") args.push("--all");

  const maxCalls = String(formData.get("maxCalls") ?? "").trim();
  if (maxCalls.length > 0) {
    if (!/^\d+$/.test(maxCalls)) throw new Error("Max model calls must be a whole number.");
    args.push("--max-calls", maxCalls);
  }

  await launchPipelineRun({ kind: "MATCH", extraArgs: args, startedBy: await principalFromRequest() });
  refresh();
};

export const startPreparation = async (formData: FormData): Promise<void> => {
  const profile = String(formData.get("profile") ?? "").trim();
  if (profile.length === 0) throw new Error("Preparation needs a profile.");

  const min = String(formData.get("min") ?? "").trim();
  const limit = String(formData.get("limit") ?? "").trim();
  if (min.length > 0 && !/^\d+$/.test(min)) throw new Error("Minimum score must be a whole number.");
  if (limit.length > 0 && !/^\d+$/.test(limit)) throw new Error("Limit must be a whole number.");

  const args = ["--profile", profile];
  if (min.length > 0) args.push("--min", min);
  if (limit.length > 0) args.push("--limit", limit);

  await launchPipelineRun({ kind: "PREPARE", extraArgs: args, startedBy: await principalFromRequest() });
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
  const applicationId = String(formData.get("applicationId") ?? "");
  if (applicationId.length === 0) throw new Error("Missing application id.");

  // The worker resolves --application within one profile's queue, so the
  // owning profile must ride along or another profile's default would win.
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { profile: { select: { slug: true } } },
  });

  await launchPipelineRun({
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
    startedBy: await principalFromRequest(),
  });

  revalidatePath("/applications");
  refresh();
};
