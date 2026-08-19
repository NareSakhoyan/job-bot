import type { z } from "zod";

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the prompt cache, billed at roughly a tenth. */
  cachedInputTokens: number;
}

export type LLMFailureReason =
  /** No provider configured, or no credentials. */
  | "unavailable"
  /** The model declined to answer. */
  | "refusal"
  /** The model answered, but the output did not satisfy the schema. */
  | "invalid_output"
  /** Transport or API error. */
  | "error";

export type LLMResult<T> =
  | { ok: true; data: T; model: string; usage: LLMUsage }
  | { ok: false; reason: LLMFailureReason; message: string };

export interface GenerateStructuredParams<S extends z.ZodTypeAny> {
  system: string;
  prompt: string;
  /** Output contract. Nothing the model returns is used unless it validates. */
  schema: S;
  schemaName: string;
  maxTokens?: number;
  /**
   * Mark the system prompt as cacheable. Worth setting when the same system
   * prompt is reused across many calls in a run — cache reads cost roughly a
   * tenth of fresh input. A cache *write* costs about 1.25x, so leave it off
   * for one-shot calls.
   */
  cacheSystem?: boolean;
}

/**
 * The seam every LLM call goes through. Swapping providers means adding one
 * implementation of this interface — no agent code changes. Implementations
 * must never throw for an expected failure; they return `ok: false` so callers
 * can degrade rather than crash.
 */
export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  /** False when the provider cannot make calls (missing key, disabled). */
  readonly available: boolean;

  generateStructured<S extends z.ZodTypeAny>(
    params: GenerateStructuredParams<S>,
  ): Promise<LLMResult<z.output<S>>>;
}
