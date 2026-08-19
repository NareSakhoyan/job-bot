import type { MatchJob, MatchProfile } from "@job-bot/shared";
import { isLargeEmployer, normalizeTitle } from "@job-bot/jobs";
import type { FactorOutcome } from "../types";

/**
 * Expected years of experience per seniority band, inferred from title
 * keywords. Ordered most specific first — "staff" must beat "engineer".
 */
const BANDS: Array<{ keywords: string[]; label: string; min: number; max: number }> = [
  { keywords: ["intern", "internship"], label: "internship", min: 0, max: 1 },
  { keywords: ["principal", "distinguished"], label: "principal", min: 10, max: 30 },
  { keywords: ["staff"], label: "staff", min: 8, max: 30 },
  { keywords: ["head of", "director", "vp"], label: "leadership", min: 10, max: 30 },
  { keywords: ["manager", "engineering manager"], label: "management", min: 6, max: 30 },
  { keywords: ["lead"], label: "lead", min: 6, max: 30 },
  { keywords: ["senior", "sr", "snr"], label: "senior", min: 5, max: 30 },
  { keywords: ["junior", "jr", "graduate", "entry level"], label: "junior", min: 0, max: 2 },
  { keywords: ["ii", "mid"], label: "mid", min: 2, max: 6 },
];

/**
 * The highest total a band can reach at a large employer.
 *
 * Years of experience answer "does this band fit the CV"; they do not answer
 * "would this employer's levelling committee agree". At a company with a
 * formal ladder and a deep applicant pool, an outside candidate is levelled
 * conservatively, so a staff or lead title is a reach regardless of what the
 * CV supports. Smaller employers hire on demonstrated ability and are left
 * alone by this ceiling entirely.
 *
 * This is a stated preference — aim at bands where the application is
 * genuinely competitive — not a claim about anyone's ability.
 */
const LARGE_EMPLOYER_CEILINGS: Record<string, number> = {
  principal: 10,
  leadership: 10,
  staff: 15,
  management: 15,
  lead: 20,
  /** The entry senior rung: plausible, but against a strong field. */
  senior: 70,
  mid: 100,
  junior: 100,
  internship: 100,
};

/** A numbered senior rung ("Senior II", "Senior 3") sits above entry senior. */
const SENIOR_RUNG_ABOVE_FIRST = /\bsenior\b[^,]*?\b(ii|iii|iv|[234])\b/;

const ceilingFor = (label: string, title: string): number => {
  const base = LARGE_EMPLOYER_CEILINGS[label] ?? 100;
  if (label !== "senior") return base;
  return SENIOR_RUNG_ABOVE_FIRST.test(title) ? 35 : base;
};

const inferBand = (title: string) => {
  const normalized = normalizeTitle(title);
  return BANDS.find((band) => band.keywords.some((keyword) => normalized.includes(keyword)));
};

/**
 * A band the candidate is under-qualified for costs more than one they are
 * over-qualified for: being too senior is a preference problem, being too
 * junior is usually a rejection.
 */
export const scoreSeniority = (profile: MatchProfile, job: MatchJob): FactorOutcome => {
  const band = inferBand(job.title);
  const normalized = normalizeTitle(job.title);

  /** Applies the large-employer ceiling, leaving smaller employers untouched. */
  const capped = (outcome: FactorOutcome): FactorOutcome => {
    if (!band || !isLargeEmployer(job.companySize)) return outcome;

    const ceiling = ceilingFor(band.label, normalized);
    if (outcome.score <= ceiling) return outcome;

    return {
      ...outcome,
      score: ceiling,
      detail: `${outcome.detail} Capped for a large employer, where a ${band.label} title is a reach for an outside applicant.`,
    };
  };

  if (!band) {
    return {
      applicable: false,
      score: 0,
      detail: "The title states no seniority level.",
    };
  }

  const years = profile.yearsOfExperience;

  if (years >= band.min && years <= band.max) {
    return capped({
      applicable: true,
      score: 100,
      detail: `${years} years fits the ${band.label} band (${band.min}+ years).`,
    });
  }

  if (years < band.min) {
    const shortfall = band.min - years;
    return capped({
      applicable: true,
      score: Math.max(0, Math.round(100 - shortfall * 22)),
      detail: `${band.label} expects around ${band.min} years; the profile records ${years}.`,
    });
  }

  const excess = years - band.max;
  return capped({
    applicable: true,
    score: Math.max(20, Math.round(100 - excess * 12)),
    detail: `${band.label} tops out around ${band.max} years; the profile records ${years}.`,
  });
};
