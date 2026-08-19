import {
  applicationAnswerSchema,
  createLogger,
  type ApplicationAnswer,
} from "@job-bot/shared";
import type { SourceProfile, TargetJob } from "@job-bot/resume";
import type { LLMProvider } from "../llm/provider";
import { HONESTY_RULES, describeExperience, describeJob, describeProfile } from "./prompt-parts";
import { rankExperiences } from "@job-bot/resume";

const logger = createLogger("agent.question");

const SYSTEM = `You answer a job application question on behalf of a candidate, using only their recorded experience.

${HONESTY_RULES}

Classify the candidate's position honestly in "strength":
- STRONG: the record shows substantial, direct, hands-on experience with what was asked.
- LIMITED: the record shows real but shallow or brief exposure.
- ADJACENT: the record shows a related but different thing. Say what the related thing is and that it is not the same.
- NONE: the record shows nothing relevant. Say so plainly.

Never upgrade a classification to sound better. Experience with one cloud provider is ADJACENT to another, never STRONG.
List every experience slug you drew on in sourceExperienceSlugs.
Put anything the candidate would have to supply themselves in missingInformation, and set requiresHumanInput to true when the answer cannot be completed from the record alone.`;

export interface QuestionResult {
  ok: boolean;
  answer: ApplicationAnswer | null;
  failure: string | null;
}

/**
 * Answers application questions from the recorded profile.
 *
 * The strength classification is the point: it forces the distinction between
 * having done something, having touched it, having done something adjacent,
 * and not having done it at all — the distinction an eager generator would
 * otherwise blur.
 */
export class QuestionAgent {
  constructor(private readonly provider: LLMProvider) {}

  async answer(
    profile: SourceProfile,
    job: TargetJob,
    question: string,
  ): Promise<QuestionResult> {
    if (!this.provider.available) {
      return {
        ok: false,
        answer: null,
        failure: "No LLM provider is configured, so no answer can be generated.",
      };
    }

    const ranked = rankExperiences(profile, job).slice(0, 5);

    const result = await this.provider.generateStructured({
      system: SYSTEM,
      prompt: [
        describeProfile(profile),
        "",
        describeJob(job),
        "",
        "## Recorded experience",
        ...ranked.map(describeExperience),
        "",
        "## The question to answer",
        question,
      ].join("\n"),
      schema: applicationAnswerSchema,
      schemaName: "application_answer",
      maxTokens: 2048,
    });

    if (!result.ok) {
      return { ok: false, answer: null, failure: result.message };
    }

    const answer = result.data;
    const knownSlugs = new Set(profile.experiences.map((experience) => experience.slug));
    const unknown = answer.sourceExperienceSlugs.filter((slug) => !knownSlugs.has(slug));

    if (unknown.length > 0) {
      return {
        ok: false,
        answer: null,
        failure: `The answer cited experience that is not recorded: ${unknown.join(", ")}.`,
      };
    }

    logger.info("Question answered", {
      question: question.slice(0, 80),
      strength: answer.strength,
      requiresHumanInput: answer.requiresHumanInput,
    });

    // The question is echoed from the request, not trusted from the model.
    return { ok: true, answer: { ...answer, question }, failure: null };
  }
}
