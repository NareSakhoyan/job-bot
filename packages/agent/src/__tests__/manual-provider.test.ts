import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { ManualLLMProvider, pendingRequests } from "../llm/manual-provider";

const schema = z.object({ reasoning: z.string().min(1), confidence: z.number().min(0).max(1) }).strict();

const params = {
  system: "You assess fit.",
  prompt: "Assess this posting.",
  schema,
  schemaName: "match_reasoning",
};

const scratch = () => mkdtemp(join(tmpdir(), "handoff-"));

/** Answers the first pending request with the given body, then stops sleeping. */
const answerWith = (directory: string, body: unknown) => {
  let answered = false;
  return async () => {
    if (answered) return;
    const [request] = await pendingRequests(directory);
    if (!request) return;
    answered = true;
    await writeFile(request.replace(".request.json", ".response.json"), JSON.stringify(body), "utf8");
  };
};

describe("ManualLLMProvider — the same seam, a slower transport", () => {
  test("writes a request carrying the prompt and the contract the answer must meet", async () => {
    const directory = await scratch();
    const provider = new ManualLLMProvider({ directory, pollMs: 0, timeoutMs: 0, sleep: async () => {} });

    await provider.generateStructured(params);

    const [request] = await pendingRequests(directory);
    const written = JSON.parse(await readFile(request as string, "utf8"));

    expect(written.prompt).toBe("Assess this posting.");
    expect(written.system).toBe("You assess fit.");
    expect(written.jsonSchema).toBeDefined();
    expect(written.respondByWriting).toMatch(/\.response\.json$/);
  });

  test("returns the written answer once it satisfies the schema", async () => {
    const directory = await scratch();
    const answer = { reasoning: "Strong overlap on the recorded stack.", confidence: 0.8 };
    const provider = new ManualLLMProvider({
      directory,
      pollMs: 0,
      timeoutMs: 10_000,
      sleep: answerWith(directory, answer),
    });

    const result = await provider.generateStructured(params);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(answer);
      // No tokens were bought; reporting otherwise would corrupt cost tracking.
      expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });
    }
  });

  test("rejects an answer that does not satisfy the schema, exactly as a model's would be", async () => {
    const directory = await scratch();
    const provider = new ManualLLMProvider({
      directory,
      pollMs: 0,
      timeoutMs: 10_000,
      sleep: answerWith(directory, { reasoning: "", confidence: 4 }),
    });

    const result = await provider.generateStructured(params);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_output");
  });

  test("rejects malformed JSON rather than crashing the run", async () => {
    const directory = await scratch();
    let answered = false;
    const provider = new ManualLLMProvider({
      directory,
      pollMs: 0,
      timeoutMs: 10_000,
      sleep: async () => {
        if (answered) return;
        const [request] = await pendingRequests(directory);
        if (!request) return;
        answered = true;
        await writeFile(request.replace(".request.json", ".response.json"), "{ not json", "utf8");
      },
    });

    const result = await provider.generateStructured(params);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_output");
  });

  test("gives up rather than blocking forever when nothing is written", async () => {
    const directory = await scratch();
    let clock = 0;
    const provider = new ManualLLMProvider({
      directory,
      pollMs: 1,
      timeoutMs: 50,
      now: () => clock,
      sleep: async () => {
        clock += 20;
      },
    });

    const result = await provider.generateStructured(params);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/No answer was written/);
  });

  test("names each request so concurrent asks do not collide", async () => {
    const directory = await scratch();
    const provider = new ManualLLMProvider({ directory, pollMs: 0, timeoutMs: 0, sleep: async () => {} });

    await provider.generateStructured(params);
    await provider.generateStructured({ ...params, schemaName: "cover_letter" });

    const requests = await pendingRequests(directory);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatch(/0001-match_reasoning\.request\.json$/);
    expect(requests[1]).toMatch(/0002-cover_letter\.request\.json$/);
  });
});
