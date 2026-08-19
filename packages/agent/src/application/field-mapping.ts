import type { FormField } from "@job-bot/browser";
import type { SourceProfile } from "@job-bot/resume";

/** Everything the mapper is allowed to put into a form. */
export interface ApplicantFacts {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  location: string;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  yearsOfExperience: number;
  currentCompany: string | null;
  currentTitle: string | null;
  requiresSponsorship: boolean;
  workAuthCountry: string;
  salaryMin: number | null;
  salaryCurrency: string;
  /** YEAR, MONTH, DAY or HOUR. Without it a figure is ambiguous on a form. */
  salaryPeriod: string;
  resumePath: string | null;
  coverLetter: string | null;
}

export type MappingConfidence = "EXACT" | "LIKELY" | "UNCERTAIN";

export interface FieldMapping {
  field: FormField;
  /** The value to enter, or null when the mapper has nothing to offer. */
  value: string | null;
  /** Which fact it came from, for the audit trail and the review screen. */
  source: string | null;
  confidence: MappingConfidence;
  /** True when a human must supply or check the value before it is used. */
  requiresHumanInput: boolean;
  note: string | null;
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Field identity is decided from label, name and placeholder together. */
const identityOf = (field: FormField): string =>
  normalize([field.label, field.name ?? "", field.placeholder ?? ""].join(" "));

interface Rule {
  source: string;
  confidence: MappingConfidence;
  /** All of these must appear. */
  all?: string[];
  /** At least one of these must appear. */
  any?: string[];
  /** None of these may appear. */
  not?: string[];
  resolve: (facts: ApplicantFacts) => string | null;
}

/**
 * Ordered most specific first. "first name" must beat "name", and
 * "current company" must beat "company", so ordering is load-bearing.
 */
const RULES: Rule[] = [
  { source: "firstName", confidence: "EXACT", all: ["first"], any: ["name"], resolve: (f) => f.firstName },
  { source: "lastName", confidence: "EXACT", all: ["last"], any: ["name"], resolve: (f) => f.lastName },
  { source: "lastName", confidence: "EXACT", all: ["surname"], resolve: (f) => f.lastName },
  { source: "fullName", confidence: "EXACT", any: ["full name", "your name", "candidate name", "legal name"], resolve: (f) => f.fullName },
  {
    // Ashby labels this field simply "Name", which matched none of the
    // qualified variants above and left a required field blank on a real
    // application. Placed after the first/last rules so those still win, and
    // guarded so it cannot claim the many other things a form names.
    source: "fullName",
    confidence: "EXACT",
    any: ["name"],
    not: [
      "company",
      "employer",
      "school",
      "university",
      "referrer",
      "reference",
      "user",
      "file",
      "domain",
      "project",
      "preferred",
      "pronoun",
      "nickname",
    ],
    resolve: (f) => f.fullName,
  },
  { source: "email", confidence: "EXACT", any: ["email", "e mail"], resolve: (f) => f.email },
  { source: "phone", confidence: "EXACT", any: ["phone", "telephone", "mobile", "contact number"], resolve: (f) => f.phone },
  { source: "linkedinUrl", confidence: "EXACT", any: ["linkedin"], resolve: (f) => f.linkedinUrl },
  { source: "githubUrl", confidence: "EXACT", any: ["github"], resolve: (f) => f.githubUrl },
  { source: "websiteUrl", confidence: "LIKELY", any: ["portfolio", "website", "personal site"], resolve: (f) => f.websiteUrl },
  { source: "currentCompany", confidence: "LIKELY", all: ["current"], any: ["company", "employer"], resolve: (f) => f.currentCompany },
  { source: "currentTitle", confidence: "LIKELY", all: ["current"], any: ["title", "role", "position"], resolve: (f) => f.currentTitle },
  {
    source: "yearsOfExperience",
    confidence: "EXACT",
    all: ["years"],
    any: ["experience"],
    resolve: (f) => String(f.yearsOfExperience),
  },
  {
    source: "location",
    confidence: "LIKELY",
    any: ["location", "city", "where are you based", "current location"],
    not: ["preferred", "willing"],
    resolve: (f) => f.location,
  },
  { source: "workAuthCountry", confidence: "LIKELY", any: ["country"], not: ["preferred"], resolve: (f) => f.workAuthCountry },
  {
    source: "salaryMin",
    confidence: "UNCERTAIN",
    any: ["salary", "compensation", "expected pay", "rate"],
    // The period is written out: "USD 2000" on a form reads as an annual
    // figure, which is a costly thing to get wrong by omission.
    resolve: (f) =>
      f.salaryMin === null
        ? null
        : `${f.salaryCurrency} ${f.salaryMin.toLocaleString("en-US")} per ${f.salaryPeriod.toLowerCase()}`,
  },
  { source: "coverLetter", confidence: "LIKELY", any: ["cover letter", "why do you want", "motivation"], resolve: (f) => f.coverLetter },
  { source: "resumePath", confidence: "EXACT", any: ["resume", "cv", "upload"], resolve: (f) => f.resumePath },
];

const matches = (identity: string, rule: Rule): boolean => {
  if (rule.not?.some((token) => identity.includes(normalize(token)))) return false;
  if (rule.all && !rule.all.every((token) => identity.includes(normalize(token)))) return false;
  if (rule.any && !rule.any.some((token) => identity.includes(normalize(token)))) return false;
  return true;
};

/**
 * Sponsorship questions are yes/no and easy to get backwards, so they are
 * resolved explicitly rather than by keyword. Note the polarity: "do you
 * require sponsorship" and "are you authorized to work" want opposite answers.
 */
const resolveSponsorship = (
  identity: string,
  facts: ApplicantFacts,
  options: string[],
): { value: string | null; note: string } | null => {
  const asksForSponsorship = /sponsor|visa/.test(identity);
  const asksForAuthorization = /authoriz|authoris|right to work|eligible to work|work permit/.test(
    identity,
  );

  if (!asksForSponsorship && !asksForAuthorization) return null;

  const wantsYes = asksForSponsorship ? facts.requiresSponsorship : !facts.requiresSponsorship;
  const target = wantsYes ? "yes" : "no";

  const option = options.find((candidate) => normalize(candidate).startsWith(target));

  return {
    value: option ?? (wantsYes ? "Yes" : "No"),
    note: asksForAuthorization
      ? `Answered from workAuthorization: authorization is country-specific (${facts.workAuthCountry}) — confirm against this posting's country.`
      : "Answered from workAuthorization.requiresSponsorship.",
  };
};

/**
 * Maps form fields to recorded facts.
 *
 * Deterministic on purpose: which box gets an email address is a lookup, not a
 * judgement, and a wrong answer here is invisible in a screenshot. Anything
 * that does not match a rule is returned with `requiresHumanInput`, never
 * guessed at, and free-text questions are left for the QuestionAgent.
 */
export const mapFieldsToFacts = (
  fields: FormField[],
  facts: ApplicantFacts,
): FieldMapping[] =>
  fields.map((field) => {
    const identity = identityOf(field);
    const options = field.options ?? [];

    if (field.type === "select" || field.type === "radio" || field.type === "checkbox") {
      const sponsorship = resolveSponsorship(identity, facts, options);
      if (sponsorship) {
        return {
          field,
          value: sponsorship.value,
          source: "workAuthorization",
          confidence: "LIKELY",
          requiresHumanInput: true,
          note: sponsorship.note,
        };
      }
    }

    const rule = RULES.find((candidate) => matches(identity, candidate));

    if (!rule) {
      return {
        field,
        value: null,
        source: null,
        confidence: "UNCERTAIN",
        requiresHumanInput: true,
        note: "No recorded fact matches this field.",
      };
    }

    const value = rule.resolve(facts);

    if (value === null) {
      return {
        field,
        value: null,
        source: rule.source,
        confidence: "UNCERTAIN",
        requiresHumanInput: true,
        note: `The profile records no ${rule.source}.`,
      };
    }

    return {
      field,
      value,
      source: rule.source,
      confidence: rule.confidence,
      requiresHumanInput: rule.confidence === "UNCERTAIN",
      note: null,
    };
  });

/** Builds the fact set from a profile. Nothing outside it may be entered. */
export const factsFromProfile = (
  profile: SourceProfile & {
    email: string;
    phone: string | null;
    location: string;
    linkedinUrl: string | null;
    githubUrl: string | null;
    websiteUrl: string | null;
    requiresSponsorship: boolean;
    workAuthCountry: string;
    salaryMin: number | null;
    salaryCurrency: string;
    salaryPeriod: string;
  },
  extras: { resumePath: string | null; coverLetter: string | null },
): ApplicantFacts => {
  const [firstName = "", ...rest] = profile.fullName.split(/\s+/);
  const current = profile.experiences.find((experience) => experience.isCurrent);

  return {
    fullName: profile.fullName,
    firstName,
    lastName: rest.join(" "),
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    linkedinUrl: profile.linkedinUrl,
    githubUrl: profile.githubUrl,
    websiteUrl: profile.websiteUrl,
    yearsOfExperience: profile.yearsOfExperience,
    currentCompany: current?.company ?? null,
    currentTitle: current?.role ?? null,
    requiresSponsorship: profile.requiresSponsorship,
    workAuthCountry: profile.workAuthCountry,
    salaryMin: profile.salaryMin,
    salaryCurrency: profile.salaryCurrency,
    salaryPeriod: profile.salaryPeriod,
    resumePath: extras.resumePath,
    coverLetter: extras.coverLetter,
  };
};
