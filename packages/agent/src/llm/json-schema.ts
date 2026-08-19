import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Keywords structured outputs does not support. They are stripped from the
 * schema sent to the model; the original Zod schema still enforces every one
 * of them locally, so nothing is actually relaxed — the model just isn't asked
 * to honour constraints the API would reject.
 */
const UNSUPPORTED_KEYWORDS = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "default",
]);

type JsonObject = Record<string, unknown>;

const sanitize = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node === null || typeof node !== "object") return node;

  const source = node as JsonObject;
  const result: JsonObject = {};

  for (const [key, value] of Object.entries(source)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    result[key] = sanitize(value);
  }

  // Every object must be closed, or the API rejects the schema.
  if (result.type === "object") result.additionalProperties = false;

  return result;
};

/**
 * Converts a Zod schema to a JSON Schema the Messages API accepts.
 * `$refStrategy: "none"` inlines definitions, since recursive and referenced
 * schemas are not supported.
 */
export const toStructuredOutputSchema = (schema: z.ZodTypeAny): JsonObject => {
  const generated = zodToJsonSchema(schema, { $refStrategy: "none", target: "jsonSchema7" });
  const sanitized = sanitize(generated) as JsonObject;

  delete sanitized.$schema;
  delete sanitized.definitions;

  return sanitized;
};
