import { createLogger } from "@job-bot/shared";
import { AnthropicProvider } from "./anthropic-provider";
import { ManualLLMProvider } from "./manual-provider";
import { NullLLMProvider } from "./null-provider";
import type { LLMProvider } from "./provider";

const logger = createLogger("llm.factory");

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORT_LEVELS)[number];

const parseEffort = (raw: string | undefined): Effort =>
  EFFORT_LEVELS.includes((raw ?? "") as Effort) ? (raw as Effort) : "medium";

/**
 * Resolves the provider from the environment. An unset or absent key yields
 * the null provider rather than an error, so every command remains runnable
 * without credentials.
 */
export interface ProviderOptions {
  /**
   * Names a task so it can use its own model. Matching runs over every job and
   * only writes explanation, so a smaller model is often the right trade; the
   * default is deliberately the same model as everything else, because
   * choosing a cheaper one is your decision, not the code's.
   */
  task?: "matching" | "generation";
}

const modelFor = (env: NodeJS.ProcessEnv, task: ProviderOptions["task"]): string | undefined => {
  if (task === "matching" && env.LLM_MATCH_MODEL) return env.LLM_MATCH_MODEL;
  return env.LLM_MODEL;
};

const effortFor = (env: NodeJS.ProcessEnv, task: ProviderOptions["task"]): string | undefined => {
  if (task === "matching" && env.LLM_MATCH_EFFORT) return env.LLM_MATCH_EFFORT;
  return env.LLM_EFFORT;
};

export const createLLMProvider = (
  env: NodeJS.ProcessEnv = process.env,
  options: ProviderOptions = {},
): LLMProvider => {
  const configured = (env.LLM_PROVIDER ?? "anthropic").toLowerCase();

  if (configured === "none") {
    logger.info("LLM provider disabled by configuration");
    return new NullLLMProvider();
  }

  if (configured === "manual") {
    const directory = env.LLM_MANUAL_DIR ?? ".llm-handoff";
    logger.info("LLM provider is a file handoff; answers are written by hand", { directory });
    return new ManualLLMProvider({
      directory,
      timeoutMs: env.LLM_MANUAL_TIMEOUT_MS ? Number(env.LLM_MANUAL_TIMEOUT_MS) : undefined,
    });
  }

  if (configured === "anthropic") {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.warn("ANTHROPIC_API_KEY is not set; reasoning will be skipped");
      return new NullLLMProvider();
    }

    const provider = new AnthropicProvider({
      apiKey,
      model: modelFor(env, options.task),
      effort: parseEffort(effortFor(env, options.task)),
    });
    logger.info("LLM provider ready", {
      provider: provider.id,
      model: provider.model,
      task: options.task ?? "default",
    });
    return provider;
  }

  logger.warn("Unknown LLM provider; reasoning will be skipped", { configured });
  return new NullLLMProvider();
};
