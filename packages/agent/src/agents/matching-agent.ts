import {
  createLogger,
  matchReasoningSchema,
  type JobMatchResult,
  type MatchJob,
  type MatchProfile,
  type MatchReasoning,
} from "@job-bot/shared";
import { scoreMatch, type DeterministicMatch } from "@job-bot/matching";
import type { LLMProvider } from "../llm/provider";
import type { CallBudget } from "../llm/call-budget";
import { UNTRUSTED_INPUT_RULE, sanitizeUntrusted } from "./prompt-parts";

const logger = createLogger("agent.matching");

const SCORER_VERSION = "deterministic/v1";

const SYSTEM_PROMPT = `You assess how well a software engineer's recorded experience fits a job posting.

Rules you must follow:
- Only reason from the profile and experience given to you. Never assume experience that is not listed.
- If the profile does not record something the job asks for, say it is missing. Do not soften it.
- Do not conflate adjacent technologies. Experience with one cloud provider is not experience with another.
- Do not assign or suggest a numeric score. Scoring is computed separately; your job is explanation and nuance.
- Be concrete and brief. Concerns should be things a hiring manager would actually raise.

${UNTRUSTED_INPUT_RULE}`;

/**
 * The candidate half of the prompt is identical for every job in a run, so it
 * lives in the system prompt where it can be cached once and read back at a
 * fraction of the cost, rather than re-sent with each posting.
 */
const buildSystemPrompt = (profile: MatchProfile): string =>
  [
    SYSTEM_PROMPT,
    "",
    "## Candidate profile",
    `Years of experience: ${profile.yearsOfExperience}`,
    `Target roles: ${profile.targetRoles.join(", ") || "none recorded"}`,
    `Rated skills: ${
      profile.skills.map((skill) => `${skill.name} (${skill.level.toLowerCase()})`).join(", ") ||
      "none recorded"
    }`,
    `Technologies used in past roles: ${profile.experienceTechnologies.join(", ") || "none recorded"}`,
    `Remote preference: ${profile.remotePreference}`,
    `Requires visa sponsorship: ${profile.requiresSponsorship ? "yes" : "no"}`,
  ].join("\n");

const buildPrompt = (job: MatchJob, deterministic: DeterministicMatch): string =>
  [
    // The posting is third-party data, fenced and stripped of instruction-shaped
    // text before it reaches the same prompt as the rules above.
    "<untrusted_job_posting>",
    "## Job posting",
    `Company: ${job.company}`,
    `Title: ${job.title}`,
    `Location: ${job.location}${job.isRemote ? " (remote)" : ""}`,
    `Employment type: ${job.employmentType ?? "not stated"}`,
    `Technologies: ${job.technologies.join(", ") || "none listed"}`,
    `Requirements:\n${job.requirements.map((line) => `- ${line}`).join("\n") || "- none listed"}`,
    "",
    "Description:",
    // The signal is front-loaded; the tail is usually benefits boilerplate.
    sanitizeUntrusted(job.descriptionText.slice(0, 3000)),
    "</untrusted_job_posting>",
    "",
    "## Deterministic assessment already computed",
    ...deterministic.factors.map((factor) => `- ${factor.factor}: ${factor.score}/100 — ${factor.detail}`),
    "",
    "Explain this match. Identify nuanced overlaps and gaps the factor scores above do not capture.",
  ].join("\n");

export interface MatchingAgentResult extends JobMatchResult {
  /** True when the LLM layer contributed reasoning. */
  reasonedByModel: boolean;
}

/**
 * Combines deterministic scoring with LLM reasoning.
 *
 * The split is deliberate and enforced here: `scoreMatch` owns the number, and
 * the model only ever contributes explanation, nuance and confidence. If the
 * model is unavailable or returns something that fails validation, the match
 * still lands — with reasoning derived from the factor breakdown.
 */
export interface MatchingAgentOptions {
  /**
   * Below this deterministic score the model is not called at all.
   *
   * Reasoning exists to help a human decide, and nobody reads the explanation
   * for a job scoring 22. Skipping them is most of the cost of a run: on a
   * typical batch well over half the postings fall here.
   */
  reasoningThreshold?: number;

  /**
   * A hard ceiling on model calls. Once spent, every remaining job is scored
   * deterministically instead of being skipped, so a capped run still produces
   * a complete set of matches — only the explanations stop.
   *
   * Omitted means unbounded.
   */
  callBudget?: CallBudget;
}

const DEFAULT_REASONING_THRESHOLD = 45;

export class MatchingAgent {
  private readonly reasoningThreshold: number;
  private readonly callBudget: CallBudget | null;
  /** The ceiling is announced once, not once per remaining job. */
  private budgetReported = false;

  constructor(
    private readonly provider: LLMProvider,
    options: MatchingAgentOptions = {},
  ) {
    this.reasoningThreshold = options.reasoningThreshold ?? DEFAULT_REASONING_THRESHOLD;
    this.callBudget = options.callBudget ?? null;
  }

  async evaluate(profile: MatchProfile, job: MatchJob): Promise<MatchingAgentResult> {
    const deterministic = scoreMatch(profile, job);

    const base = {
      score: deterministic.score,
      deterministicScore: deterministic.score,
      recommendation: deterministic.recommendation,
      factors: deterministic.factors,
      matchingSkills: deterministic.matchingSkills,
      missingSkills: deterministic.missingSkills,
      concerns: deterministic.concerns,
    };

    const deterministicOnly = (): MatchingAgentResult => ({
      ...base,
      reasoning: this.fallbackReasoning(deterministic),
      confidence: 0.4,
      modelVersion: SCORER_VERSION,
      reasonedByModel: false,
    });

    if (!this.provider.available || deterministic.score < this.reasoningThreshold) {
      return deterministicOnly();
    }

    // Reserved before the call, because a failed call can still be billed.
    // Checked after the threshold so a job that was never going to be reasoned
    // about does not consume the ceiling.
    if (this.callBudget && !this.callBudget.tryConsume()) {
      if (!this.budgetReported) {
        this.budgetReported = true;
        logger.warn("Call budget spent; remaining jobs are scored deterministically", {
          limit: this.callBudget.limit,
          firstSkipped: `${job.company} — ${job.title}`,
        });
      }
      return deterministicOnly();
    }

    const result = await this.provider.generateStructured({
      system: buildSystemPrompt(profile),
      prompt: buildPrompt(job, deterministic),
      schema: matchReasoningSchema,
      schemaName: "match_reasoning",
      // The system prompt is identical across every job in this run.
      cacheSystem: true,
    });

    if (!result.ok) {
      logger.warn("Falling back to deterministic reasoning", {
        company: job.company,
        title: job.title,
        reason: result.reason,
        message: result.message,
      });

      return deterministicOnly();
    }

    const reasoning: MatchReasoning = result.data;

    logger.info("Match reasoned", {
      company: job.company,
      title: job.title,
      score: deterministic.score,
      model: result.model,
      outputTokens: result.usage.outputTokens,
      cachedInputTokens: result.usage.cachedInputTokens,
    });

    return {
      ...base,
      // The model may surface skills and concerns the factor pass missed, but
      // it can never remove what deterministic scoring established.
      matchingSkills: [...new Set([...deterministic.matchingSkills, ...reasoning.matchingSkills])],
      missingSkills: [...new Set([...deterministic.missingSkills, ...reasoning.missingSkills])],
      concerns: [...new Set([...deterministic.concerns, ...reasoning.concerns])],
      reasoning: reasoning.reasoning,
      confidence: reasoning.confidence,
      modelVersion: `${SCORER_VERSION}+${result.model}`,
      reasonedByModel: true,
    };
  }

  /** Human-readable explanation built from the factor breakdown alone. */
  private fallbackReasoning(deterministic: DeterministicMatch): string {
    const contributing = deterministic.factors
      .filter((factor) => factor.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .map((factor) => `${factor.factor.toLowerCase().replace(/_/g, " ")}: ${factor.detail}`);

    return [
      `Scored ${deterministic.score}/100 from deterministic factors only; no model reasoning was available.`,
      ...contributing,
    ].join(" ");
  }
}
