import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createLogger } from "@job-bot/shared";
import type { GenerateStructuredParams, LLMProvider, LLMResult } from "./provider";

const logger = createLogger("llm.manual");

/**
 * An LLM provider whose transport is the filesystem and whose model is a
 * person — or an assistant working alongside one.
 *
 * It exists for the case where API credit is unavailable but the work is not.
 * Rather than hand-writing application material straight into the database,
 * which would bypass schema validation and the grounding verifier entirely,
 * this routes the same prompt through the same seam: a request lands as JSON,
 * an answer is written back as JSON, and it returns through the ordinary path
 * where `matchReasoningSchema`, `verifyResumeDraft` and every other check
 * still apply. Nothing downstream can tell the difference, which is the point
 * — the safety properties belong to the pipeline, not to the model.
 *
 * Deliberately not a default: it is slow, it needs a human in the loop, and it
 * is not reproducible. It is a bridge, not a destination.
 */
export interface ManualProviderOptions {
  /** Where requests and responses are exchanged. */
  directory: string;
  /** How long to wait for an answer before giving up. */
  timeoutMs?: number;
  /** How often to look for one. */
  pollMs?: number;
  /** Overridable so tests need not sleep. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_MS = 2000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Pads so request files sort in the order they were asked. */
const pad = (n: number) => String(n).padStart(4, "0");

export class ManualLLMProvider implements LLMProvider {
  readonly id = "manual";
  readonly model = "manual/file-handoff";
  readonly available = true;

  private counter = 0;

  constructor(private readonly options: ManualProviderOptions) {}

  async generateStructured<S extends z.ZodTypeAny>(
    params: GenerateStructuredParams<S>,
  ): Promise<LLMResult<z.output<S>>> {
    const { directory } = this.options;
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pollMs = this.options.pollMs ?? DEFAULT_POLL_MS;
    const now = this.options.now ?? Date.now;
    const sleep = this.options.sleep ?? defaultSleep;

    await mkdir(directory, { recursive: true });

    this.counter += 1;
    const stem = `${pad(this.counter)}-${params.schemaName}`;
    const requestPath = join(directory, `${stem}.request.json`);
    const responsePath = join(directory, `${stem}.response.json`);

    await writeFile(
      requestPath,
      `${JSON.stringify(
        {
          schemaName: params.schemaName,
          // The contract the answer must satisfy, so whoever answers can see it.
          jsonSchema: zodToJsonSchema(params.schema, params.schemaName),
          system: params.system,
          prompt: params.prompt,
          respondByWriting: responsePath,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    logger.info("Awaiting a written answer", { request: requestPath, response: responsePath });

    const deadline = now() + timeoutMs;
    while (now() < deadline) {
      const raw = await readFile(responsePath, "utf8").catch(() => null);
      if (raw !== null) return this.validate(params, raw);
      await sleep(pollMs);
    }

    return {
      ok: false,
      reason: "error",
      message: `No answer was written to ${responsePath} within ${Math.round(timeoutMs / 1000)}s.`,
    };
  }

  /** The answer is validated exactly as a model's would be. */
  private validate<S extends z.ZodTypeAny>(
    params: GenerateStructuredParams<S>,
    raw: string,
  ): LLMResult<z.output<S>> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        ok: false,
        reason: "invalid_output",
        message: `The written answer was not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    const result = params.schema.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false,
        reason: "invalid_output",
        message: `The written answer did not satisfy ${params.schemaName}: ${result.error.message}`,
      };
    }

    return {
      ok: true,
      data: result.data,
      model: this.model,
      // No tokens were bought, and saying otherwise would corrupt cost reporting.
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    };
  }
}

/** Requests still waiting for an answer, oldest first. */
export const pendingRequests = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory).catch(() => [] as string[]);
  const answered = new Set(
    entries.filter((name) => name.endsWith(".response.json")).map((name) => name.replace(".response.json", "")),
  );
  return entries
    .filter((name) => name.endsWith(".request.json"))
    .filter((name) => !answered.has(name.replace(".request.json", "")))
    .sort()
    .map((name) => join(directory, name));
};
