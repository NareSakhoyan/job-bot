import {
  listApplicationsForReview,
  prisma,
  resolveProfile,
  saveApplicationMaterials,
} from "@job-bot/database";
import { QuestionAgent, ResumeAgent, createLLMProvider } from "@job-bot/agent";
import { createLogger } from "@job-bot/shared";
import { toSourceProfile, toTargetJob } from "./mappers";
import { rankByMatchScore } from "./ranking";

const logger = createLogger("worker.prepare");

const ACTOR = "resume-agent";

/**
 * Questions almost every application form asks. Real per-posting questions
 * arrive with browser automation in Phase 4; answering these up front means
 * the reviewer sees the honest classification before anything is filled in.
 */
const STANDARD_QUESTIONS = [
  "Why are you interested in this role?",
  "What relevant experience do you have with the technologies in this posting?",
  "Do you require visa sponsorship, and what is your work authorization status?",
];

export interface PrepareOptions {
  profileSlug?: string | null;
  /** Only prepare applications whose match scored at least this. */
  minScore?: number;
  /** Cap the number prepared in one run. */
  limit?: number;
  /** Prepare one specific application, ignoring the score floor. */
  applicationId?: string | null;
  /** Prepare the application for one specific posting, by its URL. */
  url?: string | null;
}

/**
 * Generates and verifies application material for shortlisted jobs, then
 * parks each one at READY_FOR_REVIEW.
 *
 * This is the end of what runs unattended. Nothing here approves or submits.
 */
export const runPreparation = async (options: PrepareOptions = {}) => {
  const profileRecord = await resolveProfile(options.profileSlug);
  if (!profileRecord) throw new Error("No profile found. Run pnpm db:seed first.");

  const minScore = options.minScore ?? 65;
  const limit = options.limit ?? 3;

  const provider = createLLMProvider();
  if (!provider.available) {
    throw new Error(
      "Generating application material requires an LLM provider. Set ANTHROPIC_API_KEY, or run discovery and matching only.",
    );
  }

  const resumeAgent = new ResumeAgent(provider);
  const questionAgent = new QuestionAgent(provider);
  const profile = toSourceProfile(profileRecord);

  // Naming one posting overrides the score floor: choosing to apply is a
  // judgement the score informs but does not make.
  const targeted = options.applicationId != null || options.url != null;

  const eligible = await prisma.application.findMany({
    where: targeted
      ? {
          profileId: profileRecord.id,
          ...(options.applicationId ? { id: options.applicationId } : {}),
          ...(options.url ? { job: { url: options.url } } : {}),
        }
      : {
          profileId: profileRecord.id,
          status: { in: ["SHORTLISTED", "ANALYZED", "PREPARING"] },
          job: {
            closedAt: null,
            matches: { some: { profileId: profileRecord.id, score: { gte: minScore } } },
          },
        },
    include: { job: { include: { matches: { where: { profileId: profileRecord.id } } } } },
  });

  if (targeted && eligible.length === 0) {
    throw new Error("No application matched the given --application or --url for this profile.");
  }

  // Strongest first, then cut to the limit — the run must spend its model
  // calls on the best matches rather than the most recently updated rows.
  const candidates = rankByMatchScore(eligible).slice(0, limit);

  logger.info("Preparation started", {
    profile: profileRecord.slug,
    eligible: eligible.length,
    candidates: candidates.length,
    minScore,
    topScore: candidates[0]?.job.matches[0]?.score ?? null,
  });

  let prepared = 0;
  const skipped: Array<{ company: string; reason: string }> = [];

  for (const application of candidates) {
    const job = toTargetJob(application.job);

    const resume = await resumeAgent.generateResume(profile, job);
    if (!resume.ok || resume.resume === null) {
      skipped.push({ company: job.company, reason: resume.failure ?? "resume verification failed" });
      logger.warn("Skipped: resume could not be verified", {
        company: job.company,
        failure: resume.failure,
        issues: resume.issues.map((issue) => `${issue.path}: ${issue.message}`),
      });
      continue;
    }

    const letter = await resumeAgent.generateCoverLetter(profile, job);

    const answers = [];
    for (const question of STANDARD_QUESTIONS) {
      const answered = await questionAgent.answer(profile, job, question);
      if (answered.ok && answered.answer) answers.push(answered.answer);
    }

    const warnings = [
      ...resume.issues.filter((issue) => issue.severity === "warning"),
      ...letter.issues.filter((issue) => issue.severity === "warning"),
    ].map((issue) => `${issue.path}: ${issue.message}`);

    await saveApplicationMaterials({
      applicationId: application.id,
      tailoredResume: JSON.parse(JSON.stringify(resume.resume)),
      coverLetter: letter.ok ? letter.body : null,
      answers: JSON.parse(JSON.stringify(answers)),
      actor: ACTOR,
      notes: warnings.length === 0 ? null : `Review warnings:\n${warnings.join("\n")}`,
    });

    prepared += 1;
  }

  const awaitingReview = await listApplicationsForReview(profileRecord.id);

  logger.info("Preparation completed", {
    profile: profileRecord.slug,
    prepared,
    skipped: skipped.length,
    awaitingReview: awaitingReview.length,
  });

  return { prepared, skipped, awaitingReview: awaitingReview.length };
};
