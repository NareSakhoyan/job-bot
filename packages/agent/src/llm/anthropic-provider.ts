import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { createLogger } from "@job-bot/shared";
import { toStructuredOutputSchema } from "./json-schema";
import type { GenerateStructuredParams, LLMProvider, LLMResult } from "./provider";

const logger = createLogger("llm.anthropic");

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  /** Reasoning depth. Matching does not need the ceiling; medium is the default. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Anthropic implementation.
 *
 * The response is constrained by a JSON Schema derived from the caller's Zod
 * schema, and then re-validated against that Zod schema locally. Raw model
 * output never reaches the rest of the system: if it fails either step, the
 * call is reported as a failure and the caller degrades.
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  readonly model: string;
  readonly available = true;

  private readonly client: Anthropic;
  private readonly effort: NonNullable<AnthropicProviderOptions["effort"]>;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? DEFAULT_MODEL;
    this.effort = options.effort ?? "medium";
  }

  async generateStructured<S extends z.ZodTypeAny>(
    params: GenerateStructuredParams<S>,
  ): Promise<LLMResult<z.output<S>>> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
        // A plain string cannot carry cache_control, so a cacheable system
        // prompt is sent as a single text block instead.
        system: params.cacheSystem
          ? [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }]
          : params.system,
        output_config: {
          effort: this.effort,
          format: {
            type: "json_schema",
            schema: toStructuredOutputSchema(params.schema),
          },
        },
        messages: [{ role: "user", content: params.prompt }],
      });

      if (response.stop_reason === "refusal") {
        logger.warn("Model declined the request", { model: this.model });
        return { ok: false, reason: "refusal", message: "The model declined to answer." };
      }

      if (response.stop_reason === "max_tokens") {
        return {
          ok: false,
          reason: "invalid_output",
          message: "Response was truncated by max_tokens before it completed.",
        };
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      if (text.trim().length === 0) {
        return { ok: false, reason: "invalid_output", message: "Response contained no text." };
      }

      let candidate: unknown;
      try {
        candidate = JSON.parse(text);
      } catch {
        return {
          ok: false,
          reason: "invalid_output",
          message: `Response for ${params.schemaName} was not valid JSON.`,
        };
      }

      const validated = params.schema.safeParse(candidate);
      if (!validated.success) {
        return {
          ok: false,
          reason: "invalid_output",
          message: validated.error.issues
            .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
            .join("; "),
        };
      }

      return {
        ok: true,
        data: validated.data as z.output<S>,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("LLM request failed", { model: this.model, error: message });
      return { ok: false, reason: "error", message };
    }
  }
}
