import { DEFAULT_TECHNOLOGIES } from "./technologies";
import type { EmploymentType } from "@job-bot/shared";

/**
 * Shared parsing for job-board adapters.
 *
 * Every board publishes a title, a location and a blob of description, and
 * every one of them omits structured technologies. Rather than repeat the
 * inference in each adapter, it lives here once.
 */

/** Some boards double-escape their HTML before serialising it to JSON. */
export const decodeEntities = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

export const REMOTE_PATTERN = /\bremote\b|\banywhere\b|\bdistributed\b/i;

/**
 * Decides whether a posting is really remote.
 *
 * Boards use their own remote flag loosely — Ashby returns `isRemote: true`
 * for postings located "New York, NY (HQ)", apparently meaning
 * "remote-friendly". Taking that at face value puts on-site roles at the top
 * of a remote-only candidate's list, so the flag only counts when the location
 * text does not contradict it.
 */
export const resolveIsRemote = (input: {
  sourceFlag?: boolean | null;
  location: string;
  title?: string;
}): boolean => {
  const mentionsRemote =
    REMOTE_PATTERN.test(input.location) || REMOTE_PATTERN.test(input.title ?? "");

  if (mentionsRemote) return true;
  if (input.sourceFlag !== true) return false;

  // The flag says remote but the location names somewhere specific and says
  // nothing about remote. Trust the location.
  const namesAPlace = /[a-z]{3,}/i.test(input.location) && input.location !== "Not specified";
  return !namesAPlace;
};

/**
 * Technologies are inferred against a fixed vocabulary rather than guessed
 * from free text. A closed list produces false negatives; an open one produces
 * false positives, which corrupt matching in a way that is hard to notice.
 */
/**
 * Loaded from data/sources/technologies.json so a missing term is a data fix
 * rather than a code change. A closed list produces false negatives; an open
 * one produces false positives, which corrupt matching in ways that are hard
 * to notice — so the list stays explicit.
 */
export let TECH_VOCABULARY: readonly string[] = DEFAULT_TECHNOLOGIES;

export const setTechnologyVocabulary = (terms: readonly string[]): void => {
  TECH_VOCABULARY = terms.length > 0 ? terms : DEFAULT_TECHNOLOGIES;
};

/**
 * Sections that appear in nearly every posting and describe the employer, not
 * the job. Left in, a company blurb listing its whole stack makes every one of
 * its postings — including non-engineering ones — look like a technical match.
 */
const BOILERPLATE_HEADINGS = [
  "about us", "about the company", "who we are", "our mission", "why join",
  "benefits", "perks", "what we offer", "compensation", "our values",
  "equal opportunity", "equal employment", "eeo", "diversity", "accommodation",
  "privacy", "e-verify", "applicant privacy", "how we hire", "our culture",
];

/**
 * Cuts a posting down to the part that describes the job.
 *
 * Employer blurbs, benefits and legal text almost always follow the role
 * description, so the text is truncated at the first boilerplate heading. Two
 * refinements matter in practice: a heading in the opening lines is usually a
 * lead-in rather than the tail (a posting that opens with "About us" still
 * describes the job below it), and a cut that discards most of the posting is
 * treated as a misfire.
 */
export const stripBoilerplate = (text: string): string => {
  const lines = text.split("\n");

  const isBoilerplateHeading = (line: string): boolean => {
    const normalized = line.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    if (normalized.length === 0 || normalized.length > 60) return false;
    return BOILERPLATE_HEADINGS.some((heading) => normalized.startsWith(heading));
  };

  // Ignore headings in the opening quarter: those introduce the posting.
  const earliestMeaningfulCut = Math.ceil(lines.length * 0.25);
  const cut = lines.findIndex(
    (line, index) => index >= earliestMeaningfulCut && isBoilerplateHeading(line),
  );

  if (cut === -1) return text;

  const kept = lines.slice(0, cut).join("\n").trim();

  // Discarding most of the posting means the heading was not the tail.
  return kept.length < text.trim().length * 0.2 ? text : kept;
};

export const extractTechnologies = (text: string): string[] => {
  const haystack = stripBoilerplate(text).toLowerCase();

  return TECH_VOCABULARY.filter((technology) => {
    const needle = technology.toLowerCase().replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
    // Alphanumeric boundaries only: internal punctuation is inside the needle
    // itself, so "Node.js" matches while "Go" does not match "Google".
    return new RegExp(`(^|[^a-z0-9])${needle}([^a-z0-9]|$)`).test(haystack);
  });
};

/** Bullet-ish lines, which is as close to structured requirements as boards get. */
/** Lines that are legal or benefits text rather than a requirement. */
const NOT_A_REQUIREMENT =
  /equal opportunit|without regard to|e-verify|accommodation|applicants? with disabilit|privacy polic|background check|401\(k\)|health insurance|paid time off|parental leave|we offer|our benefits|salary range|base pay range/i;

export const extractRequirements = (text: string): string[] =>
  stripBoilerplate(text)
    .split("\n")
    .map((line) => line.replace(/^[-•*\s]+/, "").trim())
    .filter((line) => line.length > 20 && line.length < 300)
    .filter((line) => !NOT_A_REQUIREMENT.test(line))
    .slice(0, 12);

export const inferEmploymentType = (title: string, text: string): EmploymentType | null => {
  const haystack = `${title} ${text.slice(0, 1500)}`.toLowerCase();
  if (/\bintern(ship)?\b/.test(haystack)) return "INTERNSHIP";
  if (/\bcontract(or)?\b|\bfixed[- ]term\b/.test(haystack)) return "CONTRACT";
  if (/\bpart[- ]time\b/.test(haystack)) return "PART_TIME";
  if (/\bfull[- ]time\b/.test(haystack)) return "FULL_TIME";
  return null;
};

/** Maps a board's own employment-type string onto the shared enum. */
export const normalizeEmploymentType = (value: string | null | undefined): EmploymentType | null => {
  const normalized = (value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("intern")) return "INTERNSHIP";
  if (normalized.includes("contract")) return "CONTRACT";
  if (normalized.includes("temporary")) return "TEMPORARY";
  if (normalized.includes("parttime")) return "PART_TIME";
  if (normalized.includes("fulltime")) return "FULL_TIME";
  return null;
};

/** Client-side query filtering, since board endpoints offer no search. */
export const matchesQuery = (
  job: { title: string; description: string; technologies: string[]; location: string; isRemote: boolean; employmentType: EmploymentType | null },
  query: {
    keywords: string[];
    locations: string[];
    remoteOnly: boolean;
    employmentTypes: EmploymentType[];
  },
): boolean => {
  if (query.remoteOnly && !job.isRemote) return false;

  if (query.employmentTypes.length > 0 && job.employmentType !== null) {
    if (!query.employmentTypes.includes(job.employmentType)) return false;
  }

  if (query.locations.length > 0 && !job.isRemote) {
    const location = job.location.toLowerCase();
    if (!query.locations.some((candidate) => location.includes(candidate.toLowerCase()))) {
      return false;
    }
  }

  if (query.keywords.length === 0) return true;

  const haystack = `${job.title} ${job.description} ${job.technologies.join(" ")}`.toLowerCase();

  return query.keywords.some((keyword) => {
    const tokens = keyword
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter(
        (token) =>
          token.length > 1 &&
          !["senior", "staff", "principal", "lead", "junior", "software", "engineer", "engineering", "developer"].includes(
            token,
          ),
      );
    // A keyword with nothing distinctive left is a broad target, not a filter.
    if (tokens.length === 0) return true;
    return tokens.every((token) => haystack.includes(token));
  });
};

export const stripHtml = (value: string): string =>
  decodeEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
