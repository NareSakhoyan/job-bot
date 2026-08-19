/**
 * Parsers for the editing forms.
 *
 * List fields are edited as one item per line rather than through a JavaScript
 * repeater: it works without client-side JS, it is faster to edit in bulk than
 * clicking rows, and it maps directly onto the JSON the data already lives in.
 * Structured lists use a `|`-separated column layout, documented in the form.
 */

export const readString = (form: FormData, key: string): string =>
  String(form.get(key) ?? "").trim();

export const readOptional = (form: FormData, key: string): string | null => {
  const value = readString(form, key);
  return value.length === 0 ? null : value;
};

export const readBoolean = (form: FormData, key: string): boolean => form.get(key) === "on";

export const readNumber = (form: FormData, key: string): number | null => {
  const value = readString(form, key);
  if (value.length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** One item per line, blank lines dropped. */
export const readLines = (form: FormData, key: string): string[] =>
  readString(form, key)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

/** Comma-separated, for short inline lists like technologies. */
export const readCsv = (form: FormData, key: string): string[] =>
  readString(form, key)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

/** One record per line, columns separated by `|`. */
export const readColumns = (form: FormData, key: string, columns: number): string[][] =>
  readLines(form, key).map((line) => {
    const parts = line.split("|").map((part) => part.trim());
    while (parts.length < columns) parts.push("");
    return parts.slice(0, columns);
  });

/** Turns arbitrary text into a stable slug for a new record. */
export const toSlug = (...parts: string[]): string =>
  parts
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export const linesToText = (values: readonly string[]): string => values.join("\n");

export const csvToText = (values: readonly string[]): string => values.join(", ");
