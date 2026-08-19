import {
  createLogger,
  resumeDraftSchema,
  coverLetterDraftSchema,
  type CoverLetterDraft,
  type ResumeDraft,
  type TailoredResume,
} from "@job-bot/shared";
import {
  orderSkillsForJob,
  renderResumeMarkdown,
  selectExperiences,
  verifyCoverLetterDraft,
  verifyResumeDraft,
  type GroundingIssue,
  type SourceProfile,
  type TargetJob,
} from "@job-bot/resume";
import type { LLMProvider } from "../llm/provider";
import { HONESTY_RULES, describeExperience, describeJob, describeProfile } from "./prompt-parts";

const logger = createLogger("agent.resume");

export interface ResumeResult {
  ok: boolean;
  resume: TailoredResume | null;
  issues: GroundingIssue[];
  /** Why generation could not run or could not be trusted. */
  failure: string | null;
}

export interface CoverLetterResult {
  ok: boolean;
  body: string | null;
  issues: GroundingIssue[];
  missingInformation: string[];
  failure: string | null;
}

const RESUME_SYSTEM = `You tailor a candidate's real resume to a specific job posting.

${HONESTY_RULES}

For every bullet you write you must return:
- experienceSlug: the exact slug of the experience it comes from
- sourceText: a verbatim substring of that experience's recorded description, responsibilities, achievements or projects
- text: your rewritten bullet, emphasising what this posting cares about

A bullet whose sourceText is not found verbatim in the record is rejected outright, so copy carefully.
highlightedSkills must contain only skills recorded on the profile, ordered by relevance to the posting.`;

const COVER_LETTER_SYSTEM = `You write a short, specific cover letter from a candidate's real record.

${HONESTY_RULES}

Write three or four short paragraphs in the candidate's voice. Be concrete about what they actually did.
No flattery, no filler, no claims that cannot be traced to the record.
List every experience you drew on in citedExperienceSlugs.`;

/**
 * Generates tailored application material.
 *
 * Which experience is relevant is decided deterministically before the model
 * is called; the model only writes prose about the shortlist. Every draft is
 * then verified against the experience database, and a draft that fails
 * verification is discarded rather than published with a caveat.
 */
export class ResumeAgent {
  constructor(private readonly provider: LLMProvider) {}

  async generateResume(profile: SourceProfile, job: TargetJob): Promise<ResumeResult> {
    if (!this.provider.available) {
      return {
        ok: false,
        resume: null,
        issues: [],
        failure: "No LLM provider is configured, so no resume can be generated.",
      };
    }

    const shortlist = selectExperiences(profile, job);

    const result = await this.provider.generateStructured({
      system: RESUME_SYSTEM,
      prompt: [
        describeProfile(profile),
        "",
        describeJob(job),
        "",
        "## Recorded experience, ranked by relevance to this posting",
        ...shortlist.map(describeExperience),
      ].join("\n"),
      schema: resumeDraftSchema,
      schemaName: "resume_draft",
      maxTokens: 8192,
    });

    if (!result.ok) {
      return { ok: false, resume: null, issues: [], failure: result.message };
    }

    return this.verifyAndRender(profile, job, result.data, result.model);
  }

  async generateCoverLetter(
    profile: SourceProfile,
    job: TargetJob,
  ): Promise<CoverLetterResult> {
    if (!this.provider.available) {
      return {
        ok: false,
        body: null,
        issues: [],
        missingInformation: [],
        failure: "No LLM provider is configured, so no cover letter can be generated.",
      };
    }

    const shortlist = selectExperiences(profile, job);

    const result = await this.provider.generateStructured({
      system: COVER_LETTER_SYSTEM,
      prompt: [
        describeProfile(profile),
        "",
        describeJob(job),
        "",
        "## Recorded experience, ranked by relevance to this posting",
        ...shortlist.map(describeExperience),
      ].join("\n"),
      schema: coverLetterDraftSchema,
      schemaName: "cover_letter_draft",
      maxTokens: 4096,
    });

    if (!result.ok) {
      return { ok: false, body: null, issues: [], missingInformation: [], failure: result.message };
    }

    const draft: CoverLetterDraft = result.data;
    const report = verifyCoverLetterDraft(profile, job, draft);

    logger.info("Cover letter generated", {
      company: job.company,
      verified: report.ok,
      issues: report.issues.length,
    });

    return {
      ok: report.ok,
      body: report.ok ? draft.body : null,
      issues: report.issues,
      missingInformation: draft.missingInformation,
      failure: report.ok ? null : "The cover letter failed grounding verification.",
    };
  }

  private verifyAndRender(
    profile: SourceProfile,
    job: TargetJob,
    draft: ResumeDraft,
    model: string,
  ): ResumeResult {
    const report = verifyResumeDraft(profile, draft);

    logger.info("Resume drafted", {
      company: job.company,
      title: job.title,
      model,
      sections: draft.sections.length,
      verified: report.ok,
      issues: report.issues.length,
    });

    if (!report.ok) {
      return {
        ok: false,
        resume: null,
        issues: report.issues,
        failure:
          "The draft made claims that could not be traced to the experience database, so it was discarded.",
      };
    }

    const resume: TailoredResume = {
      summary: draft.summary,
      highlightedSkills: draft.highlightedSkills,
      selectedExperienceSlugs: draft.sections.map((section) => section.experienceSlug),
      selectedProjectSlugs: [],
      missingInformation: draft.missingInformation,
      markdown: renderResumeMarkdown(profile, draft),
    };

    // Skills the posting asks for come first; nothing is added.
    resume.highlightedSkills = orderSkillsForJob(profile, job).filter((skill) =>
      draft.highlightedSkills.includes(skill),
    );

    return { ok: true, resume, issues: report.issues, failure: null };
  }
}
