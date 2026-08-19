import type { z } from "zod";
import type { GenerateStructuredParams, LLMProvider, LLMResult } from "./provider";

/**
 * Used when no LLM is configured. Every stage of the system stays runnable
 * without credentials: deterministic scoring still works, and the reasoning
 * layer is reported as unavailable rather than faked.
 */
export class NullLLMProvider implements LLMProvider {
  readonly id = "none";
  readonly model = "none";
  readonly available = false;

  async generateStructured<S extends z.ZodTypeAny>(
    _params: GenerateStructuredParams<S>,
  ): Promise<LLMResult<z.output<S>>> {
    return {
      ok: false,
      reason: "unavailable",
      message: "No LLM provider is configured. Set ANTHROPIC_API_KEY to enable reasoning.",
    };
  }
}
