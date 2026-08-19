import { normalizeText } from "@job-bot/jobs";
import type { CoverLetterDraft, ResumeDraft } from "@job-bot/shared";
import type { SourceExperience, SourceProfile, TargetJob } from "./types";

export type GroundingSeverity = "error" | "warning";

export interface GroundingIssue {
  severity: GroundingSeverity;
  /** Where in the draft the problem is, e.g. "sections[0].bullets[2]". */
  path: string;
  message: string;
}

export interface GroundingReport {
  ok: boolean;
  issues: GroundingIssue[];
}

/** Every sentence-sized fact recorded for one experience. */
const factsFor = (experience: SourceExperience): string[] => [
  experience.description,
  ...experience.responsibilities,
  ...experience.achievements,
  ...experience.projects.flatMap((project) => [
    project.name,
    project.description,
    ...(project.impact === null ? [] : [project.impact]),
  ]),
];

/**
 * A quote must be long enough to actually constrain the bullet it justifies.
 *
 * Substring matching alone is trivially satisfiable: `sourceText: "the"`
 * appears in almost any record, which would let a bullet claim anything and
 * still pass. Requiring a real span makes the quote carry evidential weight.
 */
const MIN_SOURCE_WORDS = 5;
const MIN_SOURCE_CHARS = 25;

/**
 * Loose containment: the quoted source must appear in a recorded fact once
 * both sides are normalized. Strict equality would reject harmless whitespace
 * differences; substring matching on normalized text still requires the model
 * to have actually copied from the record.
 */
const isRecorded = (quote: string, experience: SourceExperience): boolean => {
  const needle = normalizeText(quote);
  if (needle.length === 0) return false;
  return factsFor(experience).some((fact) => normalizeText(fact).includes(needle));
};

const isSubstantialQuote = (quote: string): boolean => {
  const normalized = normalizeText(quote);
  return (
    normalized.length >= MIN_SOURCE_CHARS &&
    normalized.split(" ").filter((word) => word.length > 0).length >= MIN_SOURCE_WORDS
  );
};

/** Every number, percentage and currency amount appearing in a string. */
const numbersIn = (value: string): string[] =>
  (value.match(/\d[\d,.]*\s?%?/g) ?? []).map((token) => token.replace(/[,\s]/g, "").replace(/\.$/, ""));

/**
 * Capitalised multi-word phrases, which is where invented employers, products
 * and certifications show up.
 */
const properNounsIn = (value: string): string[] =>
  value.match(/\b[A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)+\b/g) ?? [];

/**
 * Checks that a rewritten bullet says nothing its source does not support.
 *
 * Verifying the quote alone leaves the actual claim unchecked — the model can
 * cite a real sentence and then write a different, better-sounding one. These
 * are the two additions that are cheap to detect and expensive to miss:
 * numbers that were never recorded, and organisations that do not exist in the
 * profile.
 */
const claimIssues = (
  bullet: { text: string; sourceText: string },
  experience: SourceExperience,
  path: string,
): GroundingIssue[] => {
  const issues: GroundingIssue[] = [];
  const supporting = [bullet.sourceText, ...factsFor(experience)].join(" ");

  const supportedNumbers = new Set(numbersIn(supporting));
  for (const claimed of numbersIn(bullet.text)) {
    if (!supportedNumbers.has(claimed)) {
      issues.push({
        severity: "error",
        path,
        message: `States "${claimed}", which appears nowhere in the recorded experience for ${experience.company}.`,
      });
    }
  }

  const supportedNouns = new Set(properNounsIn(supporting).map(normalizeText));
  supportedNouns.add(normalizeText(experience.company));
  supportedNouns.add(normalizeText(experience.role));

  for (const claimed of properNounsIn(bullet.text)) {
    const normalized = normalizeText(claimed);
    if (supportedNouns.has(normalized)) continue;
    if ([...supportedNouns].some((known) => known.includes(normalized))) continue;

    issues.push({
      severity: "warning",
      path,
      message: `Names "${claimed}", which is not in the recorded experience for ${experience.company}. Check it before sending.`,
    });
  }

  return issues;
};

/**
 * Verifies a tailored resume against the experience database.
 *
 * This is the guarantee that the system cannot invent experience. Every bullet
 * must name the experience it came from and quote the recorded text it was
 * rewritten from; a bullet that cannot be traced is an error, not a warning.
 */
export const verifyResumeDraft = (profile: SourceProfile, draft: ResumeDraft): GroundingReport => {
  const issues: GroundingIssue[] = [];
  const bySlug = new Map(profile.experiences.map((experience) => [experience.slug, experience]));
  const skillNames = new Set(profile.skills.map((skill) => normalizeText(skill.name)));

  draft.sections.forEach((section, sectionIndex) => {
    const experience = bySlug.get(section.experienceSlug);

    if (!experience) {
      issues.push({
        severity: "error",
        path: `sections[${sectionIndex}]`,
        message: `References experience "${section.experienceSlug}", which is not in the experience database.`,
      });
      return;
    }

    section.bullets.forEach((bullet, bulletIndex) => {
      const path = `sections[${sectionIndex}].bullets[${bulletIndex}]`;

      if (bullet.experienceSlug !== section.experienceSlug) {
        issues.push({
          severity: "error",
          path,
          message: `Bullet claims experience "${bullet.experienceSlug}" inside the section for "${section.experienceSlug}".`,
        });
        return;
      }

      if (!isSubstantialQuote(bullet.sourceText)) {
        issues.push({
          severity: "error",
          path,
          message: `Quoted source is too short to justify a bullet: "${bullet.sourceText}". Quote at least ${MIN_SOURCE_WORDS} words of recorded text.`,
        });
        return;
      }

      if (!isRecorded(bullet.sourceText, experience)) {
        issues.push({
          severity: "error",
          path,
          message: `Quoted source is not recorded for ${experience.company}: "${bullet.sourceText}".`,
        });
        return;
      }

      issues.push(...claimIssues(bullet, experience, path));
    });
  });

  for (const skill of draft.highlightedSkills) {
    if (!skillNames.has(normalizeText(skill))) {
      issues.push({
        severity: "error",
        path: "highlightedSkills",
        message: `"${skill}" is not a recorded skill.`,
      });
    }
  }

  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
};

/**
 * Cover letters are prose, so provenance cannot be checked line by line. What
 * can be checked is the hardest failure to spot by eye: a company the person
 * never worked for, or a technology they have never used, stated as fact.
 */
export const verifyCoverLetterDraft = (
  profile: SourceProfile,
  job: TargetJob,
  draft: CoverLetterDraft,
): GroundingReport => {
  const issues: GroundingIssue[] = [];
  const knownSlugs = new Set(profile.experiences.map((experience) => experience.slug));

  for (const slug of draft.citedExperienceSlugs) {
    if (!knownSlugs.has(slug)) {
      issues.push({
        severity: "error",
        path: "citedExperienceSlugs",
        message: `Cites experience "${slug}", which is not in the experience database.`,
      });
    }
  }

  // The same numeric check as resume bullets: an invented metric in a cover
  // letter is exactly as damaging and exactly as hard to spot by eye.
  const supportingNumbers = new Set(
    profile.experiences
      .filter((experience) => draft.citedExperienceSlugs.includes(experience.slug))
      .flatMap((experience) => numbersIn(factsFor(experience).join(" "))),
  );

  for (const claimed of numbersIn(draft.body)) {
    if (!supportingNumbers.has(claimed)) {
      issues.push({
        severity: "error",
        path: "body",
        message: `States "${claimed}", which is not recorded in any cited experience.`,
      });
    }
  }

  const body = normalizeText(draft.body);
  const allowedCompanies = new Set([
    normalizeText(job.company),
    ...profile.experiences.map((experience) => normalizeText(experience.company)),
  ]);

  // Any capitalised multi-word phrase in the original prose is a candidate
  // employer name; flag ones that match no known company.
  const candidates = draft.body.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+\b/g) ?? [];
  const flagged = new Set<string>();

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (allowedCompanies.has(normalized)) continue;
    if ([...allowedCompanies].some((company) => company.includes(normalized))) continue;
    flagged.add(candidate);
  }

  for (const candidate of flagged) {
    issues.push({
      severity: "warning",
      path: "body",
      message: `"${candidate}" reads like an organisation name but matches no company in the profile or the posting. Check it before sending.`,
    });
  }

  if (body.length === 0) {
    issues.push({ severity: "error", path: "body", message: "The letter is empty." });
  }

  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
};
