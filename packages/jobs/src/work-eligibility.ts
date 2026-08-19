/**
 * What a posting actually permits, as opposed to where it is advertised.
 *
 * "Remote" and "eligible" are different claims. A posting listed as
 * "Remote, US" is remote and still closed to anyone without US work
 * authorization; scoring it on location preference alone reads it as a perfect
 * match. This module lifts the restriction out of the posting so matching can
 * ask the question that decides candidacy: could this person take this job.
 *
 * Extraction is deterministic and conservative. Where a posting says nothing,
 * the result says UNKNOWN rather than inventing permission.
 */

/** How the role is worked. */
export type WorkArrangement = "ONSITE" | "HYBRID" | "REMOTE" | "UNKNOWN";

export interface LocationRequirement {
  arrangement: WorkArrangement;
  /**
   * Region or country tokens the role is limited to. Empty means the posting
   * states no limit — which is not the same as stating there is none.
   */
  restrictedTo: string[];
  /** True when the restriction was read from a location label rather than
   *  explicit eligibility wording, and is therefore a reading, not a quote. */
  inferred: boolean;
  detail: string;
}

/** Country and region labels as they appear in postings, mapped to a token. */
const PLACE_TOKENS: Array<{ token: string; patterns: RegExp[] }> = [
  { token: "WORLDWIDE", patterns: [/\banywhere in the world\b/, /\bworldwide\b/, /\bglobal(ly)?\b/, /\bwork from anywhere\b/] },
  { token: "EMEA", patterns: [/\bemea\b/] },
  { token: "APAC", patterns: [/\bapac\b/, /\basia[- ]pacific\b/] },
  { token: "LATAM", patterns: [/\blatam\b/, /\blatin america\b/] },
  { token: "NA", patterns: [/\bnorth america\b/] },
  { token: "EEA", patterns: [/\beea\b/, /\beuropean economic area\b/] },
  { token: "EU", patterns: [/\be\.?u\.?\b/, /\beuropean union\b/] },
  { token: "EUROPE", patterns: [/\beurope(an)?\b/] },
  { token: "UK", patterns: [/\bu\.?k\.?\b/, /\bunited kingdom\b/, /\bengland\b/, /\bscotland\b/, /\blondon\b/] },
  { token: "IE", patterns: [/\bireland\b/, /\bdublin\b/] },
  { token: "DE", patterns: [/\bgermany\b/, /\bberlin\b/, /\bmunich\b/, /\bhamburg\b/] },
  { token: "FR", patterns: [/\bfrance\b/, /\bparis\b/] },
  { token: "NL", patterns: [/\bnetherlands\b/, /\bamsterdam\b/] },
  { token: "ES", patterns: [/\bspain\b/, /\bmadrid\b/, /\bbarcelona\b/] },
  { token: "PL", patterns: [/\bpoland\b/, /\bwarsaw\b/, /\bkrak(o|ó)w\b/] },
  { token: "PT", patterns: [/\bportugal\b/, /\blisbon\b/] },
  { token: "AM", patterns: [/\barmenia\b/, /\byerevan\b/] },
  { token: "IN", patterns: [/\bindia\b/, /\bbangalore\b/, /\bbengaluru\b/, /\bhyderabad\b/] },
  { token: "CA", patterns: [/\bcanada\b/, /\btoronto\b/, /\bvancouver\b/, /\bmontr(e|é)al\b/] },
  { token: "AU", patterns: [/\baustralia\b/, /\bsydney\b/, /\bmelbourne\b/] },
  { token: "SG", patterns: [/\bsingapore\b/] },
  {
    token: "US",
    patterns: [
      /\bu\.?s\.?a?\.?\b/,
      /\bunited states\b/,
      // US state abbreviations as they appear after a city, plus common hubs.
      /,\s*(ca|ny|wa|tx|ma|il|co|ga|fl|pa|nc|or|az|va|md|nj|oh|mi|mn|ut|tn)\b/,
      /\b(san francisco|new york|seattle|austin|boston|chicago|denver|atlanta|los angeles|pittsburgh|foster city|palo alto|mountain view)\b/,
    ],
  },
];

/** Wording that states eligibility outright rather than implying it. */
const EXPLICIT_RULES: Array<{ token: string; patterns: RegExp[] }> = [
  {
    token: "US",
    patterns: [
      /authoriz(ed|ation) to work in the united states/,
      /authoriz(ed|ation) to work in the u\.?s\.?/,
      /must be (based|located|residing|resident) in the (united states|u\.?s\.?)/,
      /u\.?s\.?[- ]based (role|position|candidates)/,
    ],
  },
  {
    token: "EU",
    patterns: [/(eligible|authoriz(ed|ation)) to work in the (eu|european union)/, /must be (based|located) in the (eu|european union)/],
  },
  {
    token: "UK",
    patterns: [/right to work in the (uk|united kingdom)/, /must be (based|located) in the (uk|united kingdom)/],
  },
  {
    token: "WORLDWIDE",
    patterns: [/work from anywhere in the world/, /fully remote,? worldwide/, /we hire globally/],
  },
];

const REMOTE_HINT = /\bremote\b|\bwork from home\b|\bdistributed\b/;
const HYBRID_HINT = /\bhybrid\b/;

/** Words that qualify a remote posting without naming a place. */
const REMOTE_NOISE =
  /\b(remote|work from home|distributed|hybrid|anywhere|flexible|full|part|time|first|friendly|optional|based|only|or|and|in|the|at|from)\b/g;

/**
 * What is left of a location once "remote" and its filler words are removed.
 * Non-empty means the posting named somewhere the place vocabulary missed.
 */
const remoteQualifier = (location: string): string | null => {
  const residue = location
    .replace(REMOTE_NOISE, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .join(" ")
    .trim();

  return residue.length > 0 ? residue : null;
};

const tokensIn = (text: string): string[] => {
  const found = PLACE_TOKENS.filter((entry) => entry.patterns.some((pattern) => pattern.test(text)));
  return [...new Set(found.map((entry) => entry.token))];
};

const explicitTokensIn = (text: string): string[] => {
  const found = EXPLICIT_RULES.filter((rule) => rule.patterns.some((pattern) => pattern.test(text)));
  return [...new Set(found.map((rule) => rule.token))];
};

export interface LocationRequirementInput {
  location: string;
  isRemote: boolean;
  descriptionText: string;
}

export const extractLocationRequirement = (job: LocationRequirementInput): LocationRequirement => {
  const location = job.location.toLowerCase().trim();
  // Only the opening of a description states eligibility; the tail is benefits
  // boilerplate that mentions offices the role is not tied to.
  const description = job.descriptionText.toLowerCase().slice(0, 4000);

  const explicit = explicitTokensIn(description);
  const fromLocation = tokensIn(location);

  const isRemote = job.isRemote || REMOTE_HINT.test(location);
  const isHybrid = HYBRID_HINT.test(location) || HYBRID_HINT.test(description.slice(0, 600));

  const arrangement: WorkArrangement = isHybrid
    ? "HYBRID"
    : isRemote
      ? "REMOTE"
      : location.length > 0
        ? "ONSITE"
        : "UNKNOWN";

  if (arrangement === "UNKNOWN") {
    return { arrangement, restrictedTo: [], inferred: true, detail: "The posting states no location." };
  }

  if (explicit.length > 0) {
    return {
      arrangement,
      restrictedTo: explicit,
      inferred: false,
      detail: `The posting states eligibility is limited to ${explicit.join(", ")}.`,
    };
  }

  if (arrangement === "REMOTE" && fromLocation.length === 0) {
    // The place vocabulary is an allowlist and cannot cover every country, so
    // "no recognised place" and "no place" are different findings. A qualifier
    // that failed to parse still says the role is tied somewhere; reading it
    // as unrestricted would invent permission the posting never gave.
    const qualifier = remoteQualifier(location);
    if (qualifier) {
      return {
        arrangement,
        restrictedTo: [qualifier.toUpperCase()],
        inferred: true,
        detail: `Remote, advertised for "${qualifier}" — an unrecognised hiring region, treated as restricted.`,
      };
    }

    return {
      arrangement,
      restrictedTo: [],
      inferred: true,
      detail: "Remote with no stated country restriction.",
    };
  }

  return {
    arrangement,
    restrictedTo: fromLocation,
    inferred: true,
    detail:
      arrangement === "REMOTE"
        ? `Remote, advertised for ${fromLocation.join(", ")}.`
        : `${arrangement === "HYBRID" ? "Hybrid" : "On-site"} in ${fromLocation.join(", ")}.`,
  };
};

/** The place tokens a free-text location or country name resolves to. */
export const placeTokensFor = (text: string): string[] => tokensIn(text.toLowerCase());
