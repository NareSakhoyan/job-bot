/**
 * Text normalization used for deduplication. Kept deliberately boring and
 * pure — it is the highest-leverage correctness surface in discovery, and it
 * is covered directly by tests.
 */

/** Legal-entity suffixes that differ between boards for the same employer. */
const COMPANY_SUFFIXES = [
  "inc",
  "incorporated",
  "llc",
  "l l c",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "gmbh",
  "ag",
  "bv",
  "nv",
  "sa",
  "sas",
  "srl",
  "oy",
  "ab",
  "as",
  "plc",
  "pty",
  "pte",
  "llp",
  "holdings",
  "group",
];

/** Seniority and formatting noise that boards append to otherwise equal titles. */
const TITLE_NOISE = [
  "remote",
  "hybrid",
  "onsite",
  "on site",
  "contract",
  "full time",
  "part time",
  "m f d",
  "m w d",
  "w m d",
  "h f",
  "f m",
];

const stripDiacritics = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Lowercase, de-accent, collapse punctuation and whitespace to single spaces. */
export const normalizeText = (value: string): string =>
  stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export const normalizeCompany = (company: string): string => {
  let normalized = normalizeText(company);

  // Suffixes can stack ("Acme Group Ltd"), so strip repeatedly from the end.
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of COMPANY_SUFFIXES) {
      if (normalized === suffix) continue;
      if (normalized.endsWith(` ${suffix}`)) {
        normalized = normalized.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
    }
  }

  return normalized;
};

export const normalizeTitle = (title: string): string => {
  let normalized = normalizeText(title);

  for (const noise of TITLE_NOISE) {
    normalized = normalized.replace(new RegExp(`(^| )${noise}( |$)`, "g"), " ");
  }

  return normalized.replace(/\s+/g, " ").trim();
};

/**
 * Buckets a location so that "Berlin, Germany", "Berlin (Hybrid)" and "Berlin"
 * collapse together, while remote roles collapse to a single "remote" bucket
 * regardless of how the board phrases it.
 *
 * Boards differ in how much administrative detail they append after the city,
 * so the primary segment is taken before punctuation is stripped.
 */
export const normalizeLocationBucket = (location: string, isRemote: boolean): string => {
  if (isRemote) return "remote";

  const full = normalizeText(location);
  if (!full) return "unspecified";
  if (/(^| )remote($| )/.test(full)) return "remote";

  const [primarySegment] = location.split(/[,|(\u00b7\u2013\u2014-]/);
  const primary = normalizeText(primarySegment ?? "");

  return primary || full;
};

/** Collapses a raw description to plain, single-spaced text for matching. */
export const normalizeDescription = (description: string): string =>
  description
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
