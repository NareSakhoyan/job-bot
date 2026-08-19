import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  claimForSubmission,
  listApprovedForSubmission,
  markHandedOff,
  markSubmissionFailed,
  markSubmitted,
  resolveProfile,
} from "@job-bot/database";
import { BrowserAgent, printHtmlToPdf, SubmissionRefusedError } from "@job-bot/browser";
import { ApplicationAgent, QuestionAgent, createLLMProvider, factsFromProfile } from "@job-bot/agent";
import { renderResumeHtml, resumeFileName } from "@job-bot/resume";
import { createLogger, dataPath, tailoredResumeSchema } from "@job-bot/shared";
import { toSourceProfile, toTargetJob } from "./mappers";

const logger = createLogger("worker.submit");

const ACTOR = "browser-agent";
const ARTIFACT_DIR = "artifacts";

export type SubmitMode =
  /** Fill the form, click submit, capture evidence. */
  | "auto"
  /** Fill the form and leave a visible browser open for a person to finish. */
  | "handoff";

export interface SubmitOptions {
  profileSlug?: string | null;
  applicationId?: string | null;
  mode?: SubmitMode;
  /** Without this, the run reports what it would do and changes nothing. */
  confirm?: boolean;
  /** Ceiling on how many applications one run may send. */
  limit?: number;
  /** Target a specific form instead of the posting's own URL. */
  url?: string | null;
}

/**
 * Sends approved applications.
 *
 * Four properties matter more than anything else here, because the action
 * cannot be undone:
 *
 *  - **Nothing happens without `--confirm`.** The default is a dry run that
 *    reports exactly what it would send.
 *  - **Handoff is the default mode**, not auto. Choosing to have the machine
 *    click submit should be a decision, not something you inherit.
 *  - **Only human-approved applications are eligible**, and one already sent is
 *    refused by both the authorization check and the database write.
 *  - **A form with empty required fields is never submitted.** A half-filled
 *    application is worse than a late one.
 */
export const runSubmit = async (options: SubmitOptions = {}) => {
  const profileRecord = await resolveProfile(options.profileSlug);
  if (!profileRecord) throw new Error("No profile found. Run pnpm db:seed first.");

  const mode: SubmitMode = options.mode ?? "handoff";
  const limit = options.limit ?? 1;

  const requested = options.applicationId ?? null;
  const approved = (await listApprovedForSubmission(profileRecord.id)).filter(
    (application) => requested === null || application.id === requested,
  );

  if (approved.length === 0) {
    logger.info("Nothing approved and unsent", { profile: profileRecord.slug });
    return {
      attempted: 0,
      submitted: 0,
      unconfirmed: 0,
      handedOff: 0,
      failed: 0,
      dryRun: options.confirm !== true,
    };
  }

  const queue = approved.slice(0, limit);

  if (options.confirm !== true) {
    logger.info("Dry run — nothing was sent. Re-run with --confirm to send.", {
      profile: profileRecord.slug,
      mode,
      wouldSend: queue.map((application) => `${application.job.company} — ${application.job.title}`),
      approvedBeyondLimit: approved.length - queue.length,
    });
    return { attempted: 0, submitted: 0, unconfirmed: 0, handedOff: 0, failed: 0, dryRun: true };
  }

  await mkdir(ARTIFACT_DIR, { recursive: true });

  const provider = createLLMProvider();
  const profile = toSourceProfile(profileRecord);

  let submitted = 0;
  let failed = 0;
  let handedOff = 0;
  let unconfirmed = 0;

  for (const application of queue) {
    // Claim before doing anything irreversible. Losing the claim means another
    // run is already acting on this application.
    if (!(await claimForSubmission(application.id))) {
      logger.warn("Skipped: another run already claimed this application", {
        applicationId: application.id,
        company: application.job.company,
      });
      continue;
    }

    // Handoff needs a window a person can actually see and use.
    const browser = new BrowserAgent({ headless: mode === "auto", artifactDir: ARTIFACT_DIR });

    try {
      const parsedResume = tailoredResumeSchema.safeParse(application.tailoredResume);
      let resumePath: string | null = null;

      if (parsedResume.success) {
        // The application id lives in the path, not in the filename: the
        // directory keeps runs distinct while the document keeps a name a
        // recruiter can read.
        const artifactDir = join(process.cwd(), ARTIFACT_DIR, application.id);
        await mkdir(artifactDir, { recursive: true });

        await writeFile(
          join(artifactDir, resumeFileName(profileRecord.fullName, application.job.title, "md")),
          parsedResume.data.markdown,
          "utf8",
        );
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
        options.url ??
        (application.job.url.startsWith("http")
          ? application.job.url
          : pathToFileURL(dataPath("test-forms", "application-form.html")).href);

      const agent = new ApplicationAgent(
        browser,
        provider.available ? new QuestionAgent(provider) : null,
      );

      const report = await agent.fillForm({
        url,
        facts,
        profile,
        job: toTargetJob(application.job),
        screenshotName: `submit-${application.id}`,
      });

      const unfilledRequired = report.unfilled
        .filter((field) => field.required)
        .map((field) => field.label);

      const form = {
        fieldsFound: report.fieldsFound,
        filledCount: report.filled.length,
        unfilledRequired,
      };

      if (mode === "handoff") {
        logger.info("Form filled — review it in the open window and submit it yourself", {
          company: application.job.company,
          filled: report.filled.length,
          unfilledRequired,
          url: report.url,
        });

        await markHandedOff({
          applicationId: application.id,
          actor: ACTOR,
          url: report.url,
          unfilledRequired,
        });

        handedOff += 1;
        await browser.handOffToHuman(report.submitControls[0]?.selector ?? null);
        continue;
      }

      const control = report.submitControls[0];
      if (!control) {
        throw new SubmissionRefusedError(
          report.openerControls.length > 0
            ? "the page only offers a control that opens the application form, not one that sends it."
            : "no control that sends the application was found on the page.",
        );
      }

      const evidence = await browser.submitForm({
        selector: control.selector,
        authorization: {
          applicationId: application.id,
          approvedBy: application.approvedBy ?? "unknown",
          // An approval with no timestamp fails the authorization check rather
          // than silently passing with a default.
          approvedAt: application.approvedAt ?? new Date(Number.NaN),
          alreadySubmittedAt: application.submittedAt,
        },
        form,
        screenshotName: `submit-${application.id}`,
      });

      await markSubmitted({
        applicationId: application.id,
        actor: ACTOR,
        url: evidence.url,
        confirmationText: evidence.confirmationText,
        screenshots: [evidence.screenshotBefore, evidence.screenshotAfter],
        mode: "auto",
      });

      submitted += 1;
      if (evidence.confirmationText === null) unconfirmed += 1;

      logger.info("Application submitted", {
        company: application.job.company,
        title: application.job.title,
        confirmed: evidence.confirmationText !== null,
      });
    } catch (error) {
      failed += 1;
      const reason = error instanceof Error ? error.message : String(error);

      // markSubmissionFailed leaves it retryable, which also clears the claim.
      await markSubmissionFailed({ applicationId: application.id, actor: ACTOR, reason });
      logger.error("Submission failed", { company: application.job.company, reason });
    } finally {
      await browser.close();
    }
  }

  logger.info("Submission run finished", {
    profile: profileRecord.slug,
    mode,
    submitted,
    unconfirmed,
    handedOff,
    failed,
  });

  return { attempted: queue.length, submitted, unconfirmed, handedOff, failed, dryRun: false };
};
