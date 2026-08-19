import { extractLocationRequirement, placeTokensFor } from "@job-bot/jobs";
import type { MatchJob, MatchProfile } from "@job-bot/shared";
import type { FactorOutcome } from "../types";

/**
 * Which countries a regional hiring scope covers.
 *
 * Geographic containment only. A region admitting a country says the role is
 * advertised there — never that the candidate may legally work there, which
 * is why EU and EEA list only member states and nothing else.
 */
const REGION_MEMBERS: Record<string, readonly string[]> = {
  EMEA: ["AM", "DE", "FR", "NL", "ES", "PL", "PT", "UK", "IE"],
  EU: ["DE", "FR", "NL", "ES", "PL", "PT", "IE"],
  EEA: ["DE", "FR", "NL", "ES", "PL", "PT", "IE"],
  NA: ["US", "CA"],
  APAC: ["IN", "SG", "AU"],
};

/**
 * "Europe" is not a hiring region with a defined membership. Companies using
 * it usually mean the EU or EEA, sometimes the continent. It is scored as
 * uncertain rather than resolved either way.
 */
const AMBIGUOUS_SCOPES = new Set(["EUROPE"]);

const admits = (scope: string, country: string): boolean =>
  scope === "WORLDWIDE" || scope === country || (REGION_MEMBERS[scope]?.includes(country) ?? false);

/**
 * Whether the candidate could actually take this job.
 *
 * Separate from LOCATION, which scores preference — where someone would like
 * to work. This factor scores permission, and the two disagree constantly: a
 * posting reading "Remote, US" satisfies a remote preference perfectly while
 * being closed to anyone without US work authorization. Conflating them is
 * what produces a shortlist full of jobs that will never reply.
 */
export const scoreWorkEligibility = (profile: MatchProfile, job: MatchJob): FactorOutcome => {
  const requirement = extractLocationRequirement(job);
  const home = placeTokensFor(profile.workAuthCountry)[0] ?? profile.workAuthCountry.toUpperCase();

  if (requirement.arrangement === "UNKNOWN") {
    return {
      applicable: true,
      score: 55,
      detail: "The posting states neither a location nor an eligibility rule, so this is unverified.",
    };
  }

  if (requirement.arrangement === "ONSITE" || requirement.arrangement === "HYBRID") {
    const label = requirement.arrangement === "ONSITE" ? "On-site" : "Hybrid";

    if (requirement.restrictedTo.some((scope) => admits(scope, home))) {
      return { applicable: true, score: 100, detail: `${label} in ${profile.workAuthCountry}.` };
    }

    if (profile.willRelocate) {
      return {
        applicable: true,
        score: 40,
        detail: `${label} abroad — possible only with relocation and sponsorship. ${requirement.detail}`,
      };
    }

    return {
      applicable: true,
      score: 0,
      detail: `${label} abroad and relocation is not on the table. ${requirement.detail}`,
    };
  }

  // Remote from here on.
  if (requirement.restrictedTo.length === 0) {
    return {
      applicable: true,
      score: 75,
      detail: "Remote with no stated country restriction — likely open, but unconfirmed.",
    };
  }

  if (requirement.restrictedTo.some((scope) => admits(scope, home))) {
    const worldwide = requirement.restrictedTo.includes("WORLDWIDE");
    return {
      applicable: true,
      score: worldwide ? 100 : 95,
      detail: worldwide
        ? "Remote, hiring worldwide."
        : `Remote, and ${profile.workAuthCountry} falls inside the stated hiring region.`,
    };
  }

  if (requirement.restrictedTo.some((scope) => AMBIGUOUS_SCOPES.has(scope))) {
    return {
      applicable: true,
      score: 55,
      detail: `Remote within "Europe", which may or may not include ${profile.workAuthCountry}. Worth confirming before applying.`,
    };
  }

  return {
    applicable: true,
    score: 0,
    detail: `Remote but restricted to ${requirement.restrictedTo.join(", ")}, which excludes ${profile.workAuthCountry}.`,
  };
};
