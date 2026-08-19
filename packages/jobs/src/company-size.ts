import type { CompanySize } from "@job-bot/shared";

/**
 * Reads an employer's headcount out of a posting.
 *
 * Companies describe their own size constantly — "over 3,000 people",
 * "a team of 40", "150+ Mitarbeitende" — and that sentence is worth more than
 * a hand-maintained list, because it covers every employer in an aggregator
 * feed rather than the handful someone remembered to record. A 3,000-person
 * company advertising a Staff Engineer role reached the top of a shortlist
 * built to avoid exactly that, purely because no entry existed for it.
 *
 * Conservative by construction. A number only counts when it sits next to a
 * word meaning "person employed here", and never when it is followed by
 * something a company counts other than staff — customers, users, households,
 * locations. A wrong size is worse than no size, because no size applies no
 * ceiling while a wrong one applies the wrong ceiling.
 */

/** Words that mean "person employed here", English and German. */
const STAFF_NOUNS =
  "employees?|people|persons|colleagues|staff|team\\s?members|teammates|mitarbeitende[nr]?|mitarbeiter(innen)?|besch(ä|ae)ftigte[nr]?|angestellte[nr]?";

/** Things a company counts that are not its staff. */
const NOT_STAFF =
  /^\s*(customers?|users?|clients?|households?|homes?|locations?|offices?|countries|cities|projects?|installations?|partners?|stores?|members|downloads|companies|businesses)/i;

const NUMBER = "(\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(k|m|million|thousand)?\\+?";

const PATTERNS: RegExp[] = [
  // "over 3,000 people", "more than 500 employees", "150+ Mitarbeitende"
  new RegExp(`(?:over|more than|about|around|nearly|some|über|mehr als|rund|ca\\.?)?\\s*${NUMBER}\\s*(?:${STAFF_NOUNS})\\b`, "i"),
  // "a team of 40", "team of over 200"
  new RegExp(`team of (?:over|more than|about|around)?\\s*${NUMBER}`, "i"),
  // "we are 120 strong", "we are a 40-person company"
  new RegExp(`we(?:'| a)?re (?:a )?${NUMBER}[- ](?:person|strong|people)`, "i"),
];

const toCount = (digits: string, scale: string | undefined): number => {
  // 3,000 and 3.000 are both three thousand in the wild; 1.5 with a scale is not.
  const normalized = /[.,]\d{3}(?:[.,]|$)/.test(digits)
    ? Number(digits.replace(/[.,]/g, ""))
    : Number(digits.replace(",", "."));

  if (!Number.isFinite(normalized)) return Number.NaN;

  const factor = scale ? (/^(m|million)$/i.test(scale) ? 1_000_000 : 1_000) : 1;
  return normalized * factor;
};

/** Roughly: STARTUP <50, SMALL 50–200, MID 200–1000, LARGE 1000–5000, ENTERPRISE 5000+. */
export const bandForHeadcount = (count: number): CompanySize => {
  if (count < 50) return "STARTUP";
  if (count < 200) return "SMALL";
  if (count < 1000) return "MID";
  if (count < 5000) return "LARGE";
  return "ENTERPRISE";
};

export interface ExtractedSize {
  size: CompanySize;
  headcount: number;
  /** The sentence fragment it was read from, so a wrong reading is traceable. */
  evidence: string;
}

export const extractCompanySize = (descriptionText: string): ExtractedSize | null => {
  const text = descriptionText.slice(0, 6000);

  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;

    // Reject when the number counts something other than staff.
    const after = text.slice(match.index + match[0].length);
    if (NOT_STAFF.test(after)) continue;

    const count = toCount(match[1] as string, match[2]);
    // Below ten is almost always a founding anecdote; above a million is not a
    // headcount. Both readings are more likely wrong than useful.
    if (!Number.isFinite(count) || count < 10 || count > 1_000_000) continue;

    return {
      size: bandForHeadcount(count),
      headcount: count,
      evidence: match[0].trim(),
    };
  }

  return null;
};
