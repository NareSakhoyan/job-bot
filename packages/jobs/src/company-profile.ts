/**
 * What is known about an employer, as opposed to a posting.
 *
 * Postings carry a company name and nothing else — no headcount, no
 * headquarters, no stage. Preferences like "smaller companies" or "not a lead
 * role at a large one" are unanswerable without this, so it is recorded
 * alongside the source watchlists and looked up by name.
 *
 * Sizes are bands rather than headcounts on purpose. A headcount is wrong
 * within weeks and invites false precision; a band survives a funding round.
 * Entries are hand-recorded estimates, not sourced figures — treat a missing
 * entry as unknown rather than assuming a default.
 */
import { COMPANY_SIZES, type CompanySize } from "@job-bot/shared";
import { normalizeCompany } from "./normalize";

export { COMPANY_SIZES, type CompanySize };

/** Roughly: STARTUP <50, SMALL 50–200, MID 200–1000, LARGE 1000–5000, ENTERPRISE 5000+. */
export interface CompanyProfile {
  company: string;
  size: CompanySize;
  /** ISO-ish country token for the headquarters, e.g. "US", "DE". */
  hqCountry: string;
  /** Coarse region token, matching the work-eligibility vocabulary. */
  region: string;
}

/**
 * Finds an employer by name, tolerating the punctuation and suffix noise that
 * postings carry ("GitLab Inc." and "gitlab" are the same employer).
 */
export const resolveCompanyProfile = (
  company: string,
  profiles: readonly CompanyProfile[],
): CompanyProfile | null => {
  const target = normalizeCompany(company);
  return profiles.find((profile) => normalizeCompany(profile.company) === target) ?? null;
};

/** Companies where an outside candidate faces a formal levelling bar. */
export const isLargeEmployer = (size: CompanySize | null): boolean =>
  size === "LARGE" || size === "ENTERPRISE";
