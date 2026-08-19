import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { prisma, resolveProfile } from "@job-bot/database";
import { BrowserAgent, printHtmlToPdf } from "@job-bot/browser";
import { ApplicationAgent, QuestionAgent, createLLMProvider, factsFromProfile } from "@job-bot/agent";
import { createLogger, dataPath, tailoredResumeSchema } from "@job-bot/shared";
import { renderResumeHtml, resumeFileName } from "@job-bot/resume";
import { toSourceProfile, toTargetJob } from "./mappers";

const logger = createLogger("worker.fill");

export interface FillOptions {
  profileSlug?: string | null;
  /** Defaults to the bundled local test form. */
  url?: string | null;
  /** Which approved application's materials to use. */
  applicationId?: string | null;
  headless?: boolean;
}

const ARTIFACT_DIR = "artifacts";

/**
 * Fills an application form and stops before submission.
 *
 * The default target is the local test fixture, so the whole path can be
 * exercised without touching anyone's real careers site. Whatever the target,
 * nothing is submitted: BrowserAgent.click throws on submit controls, and this
 * command never attempts one.
 */
export const runFill = async (options: FillOptions = {}) => {
  const profileRecord = await resolveProfile(options.profileSlug);
  if (!profileRecord) throw new Error("No profile found. Run pnpm db:seed first.");

  // Only approved applications are filled. Touching a form for something a
  // human has not signed off on is the wrong default, even though this command
  // stops short of submitting.
  const application = await prisma.application.findFirst({
    where: {
      profileId: profileRecord.id,
      ...(options.applicationId ? { id: options.applicationId } : {}),
      status: "APPROVED",
    },
    include: { job: true },
    orderBy: [{ approvedAt: "desc" }],
  });

  if (!application) {
    throw new Error(
      "No approved application found for this profile. Run pnpm prepare, then approve it on /review.",
    );
  }

  await mkdir(ARTIFACT_DIR, { recursive: true });

  const profile = toSourceProfile(profileRecord);

  // Forms want a PDF. The Markdown is kept alongside it because it is what the
  // review screen showed and what the grounding check verified.
  const parsedResume = tailoredResumeSchema.safeParse(application.tailoredResume);
  let resumePath: string | null = null;

  if (parsedResume.success) {
    // The application id lives in the path, not in the filename: the directory
    // keeps runs distinct while the document keeps a name a recruiter can read.
    const artifactDir = join(process.cwd(), ARTIFACT_DIR, application.id);
    await mkdir(artifactDir, { recursive: true });

    const markdownPath = join(artifactDir, resumeFileName(profileRecord.fullName, application.job.title, "md"));
    await writeFile(markdownPath, parsedResume.data.markdown, "utf8");

    resumePath = join(artifactDir, resumeFileName(profileRecord.fullName, application.job.title));
    await printHtmlToPdf(
      renderResumeHtml(parsedResume.data.markdown, `${profileRecord.fullName} — resume`),
      resumePath,
    );
  }
  const facts = factsFromProfile(
    {
      ...profile,
      email: profileRecord.email,
      phone: profileRecord.phone,
      location: profileRecord.location,
      linkedinUrl: profileRecord.linkedinUrl,
      githubUrl: profileRecord.githubUrl,
      websiteUrl: profileRecord.websiteUrl,
      requiresSponsorship: profileRecord.requiresSponsorship,
      workAuthCountry: profileRecord.workAuthCountry,
      salaryMin: profileRecord.salaryMin,
      salaryCurrency: profileRecord.salaryCurrency,
      salaryPeriod: profileRecord.salaryPeriod,
    },
    { resumePath, coverLetter: application.coverLetter },
  );

  const url =
    options.url ?? pathToFileURL(dataPath("test-forms", "application-form.html")).href;

  const provider = createLLMProvider();
  const browser = new BrowserAgent({
    headless: options.headless ?? true,
    artifactDir: ARTIFACT_DIR,
  });

  try {
    const agent = new ApplicationAgent(
      browser,
      provider.available ? new QuestionAgent(provider) : null,
    );

    const report = await agent.fillForm({
      url,
      facts,
      profile,
      job: toTargetJob(application.job),
      screenshotName: `filled-${application.id}`,
    });

    // The run is recorded like any other agent action.
    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        type: "FORM_FILLED",
        actor: "browser-agent",
        message: `Filled ${report.filled.length} of ${report.fieldsFound} fields at ${report.url}; stopped before submission.`,
        metadata: JSON.parse(
          JSON.stringify({
            url: report.url,
            filled: report.filled.map((entry) => ({ label: entry.label, source: entry.source })),
            unfilled: report.unfilled.map((entry) => entry.label),
            submitControlsDetected: report.submitControls.map((control) => control.label),
            screenshotPath: report.screenshotPath,
            stoppedBeforeSubmission: true,
          }),
        ),
      },
    });

    logger.info("Fill complete — stopped before submission", {
      company: application.job.company,
      filled: report.filled.length,
      unfilled: report.unfilled.length,
      screenshot: report.screenshotPath,
    });

    return report;
  } finally {
    await browser.close();
  }
};
