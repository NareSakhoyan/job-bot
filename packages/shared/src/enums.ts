/**
 * Canonical domain enums. These are the single source of truth: the Prisma
 * schema and the Zod schemas both mirror these values, and a mismatch is a
 * compile/validation error rather than a silent divergence.
 */

export const REMOTE_PREFERENCES = ["REMOTE_ONLY", "HYBRID", "ONSITE", "FLEXIBLE"] as const;
export type RemotePreference = (typeof REMOTE_PREFERENCES)[number];

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "TEMPORARY",
  "FREELANCE",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const SKILL_LEVELS = ["EXPERT", "ADVANCED", "INTERMEDIATE", "BEGINNER"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const SALARY_PERIODS = ["YEAR", "MONTH", "DAY", "HOUR"] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const WORK_AUTHORIZATION_STATUSES = [
  "CITIZEN",
  "PERMANENT_RESIDENT",
  "WORK_VISA",
  "STUDENT_VISA",
  "REQUIRES_SPONSORSHIP",
] as const;
export type WorkAuthorizationStatus = (typeof WORK_AUTHORIZATION_STATUSES)[number];

export const MATCH_RECOMMENDATIONS = [
  "STRONG_MATCH",
  "GOOD_MATCH",
  "POSSIBLE_MATCH",
  "WEAK_MATCH",
  "NOT_RECOMMENDED",
] as const;
export type MatchRecommendation = (typeof MATCH_RECOMMENDATIONS)[number];

/**
 * Confidence the agent has in its own assessment of a candidate's experience
 * with a technology. Used by the QuestionAgent in Phase 3 so that "I know GCP"
 * can never be reported as "extensive AWS experience".
 */
export const EXPERIENCE_STRENGTHS = ["STRONG", "LIMITED", "ADJACENT", "NONE"] as const;
export type ExperienceStrength = (typeof EXPERIENCE_STRENGTHS)[number];

export const APPLICATION_STATUSES = [
  "DISCOVERED",
  "ANALYZED",
  "SHORTLISTED",
  "REJECTED",
  "PREPARING",
  "READY_FOR_REVIEW",
  "APPROVED",
  "SUBMITTED",
  "WITHDRAWN",
  "REJECTED_BY_COMPANY",
  "INTERVIEW",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const SUBMISSION_STATUSES = [
  "NOT_STARTED",
  "FORM_FILLED",
  "AWAITING_APPROVAL",
  /** A run has claimed this application and is acting on it right now. */
  "IN_PROGRESS",
  /** Filled and opened for a person to finish in a visible browser. */
  "HANDED_OFF",
  "SUBMITTED",
  /**
   * The submit control was clicked but the page never acknowledged receipt.
   * The application is still marked as sent — clicking is not undoable, and
   * treating it as unsent would risk a duplicate — but it needs checking by
   * hand before it is trusted.
   */
  "UNCONFIRMED",
  "FAILED",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * The ordered pipeline shown on the applications board. Terminal states
 * (rejected/withdrawn) are deliberately excluded from the happy path.
 */
export const APPLICATION_PIPELINE: readonly ApplicationStatus[] = [
  "DISCOVERED",
  "ANALYZED",
  "SHORTLISTED",
  "PREPARING",
  "READY_FOR_REVIEW",
  "APPROVED",
  "SUBMITTED",
  "INTERVIEW",
] as const;

export const TERMINAL_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "REJECTED",
  "WITHDRAWN",
  "REJECTED_BY_COMPANY",
] as const;

export const EDUCATION_KINDS = ["DEGREE", "COURSE", "CERTIFICATION"] as const;
export type EducationKind = (typeof EDUCATION_KINDS)[number];

/**
 * Employer size bands. Bands rather than headcounts: a headcount is stale
 * within weeks, a band survives a funding round.
 * Roughly STARTUP <50, SMALL 50–200, MID 200–1000, LARGE 1000–5000, ENTERPRISE 5000+.
 */
export const COMPANY_SIZES = ["STARTUP", "SMALL", "MID", "LARGE", "ENTERPRISE"] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

/** How far an application got before it ended. */
export const OUTCOME_STAGES = [
  "NO_RESPONSE",
  "APPLICATION_REVIEW",
  "RECRUITER_SCREEN",
  "TECHNICAL_SCREEN",
  "INTERVIEW_LOOP",
  "FINAL_ROUND",
  "OFFER_STAGE",
] as const;
export type OutcomeStage = (typeof OUTCOME_STAGES)[number];

/** How it ended. */
export const OUTCOME_RESULTS = ["REJECTED", "GHOSTED", "WITHDRAWN", "OFFER", "ONGOING"] as const;
export type OutcomeResult = (typeof OUTCOME_RESULTS)[number];

/**
 * The closed vocabulary of objective rejection reasons.
 *
 * Closed on purpose. Company feedback is mostly subjective and mostly vague,
 * and the only part worth learning from is what can be checked against a
 * posting: years asked for, technologies listed, authorization required. A
 * free-text reason cannot drive matching without letting one recruiter's
 * phrasing rewrite the scorer, so the verbatim text is kept for the human and
 * only these codes are machine-readable.
 */
export const REJECTION_REASONS = [
  "INSUFFICIENT_YEARS",
  "SENIORITY_MISMATCH",
  "MISSING_TECHNOLOGY",
  "DOMAIN_EXPERIENCE",
  "WORK_AUTHORIZATION",
  "LOCATION_OR_TIMEZONE",
  "LANGUAGE_REQUIREMENT",
  "SALARY_EXPECTATION",
  "ROLE_CLOSED",
  "INTERNAL_CANDIDATE",
  "STRONGER_APPLICANTS",
  "NO_REASON_GIVEN",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/**
 * Reasons that say nothing about the candidate.
 *
 * A cancelled role or an internal hire is not evidence to search differently,
 * and treating it as such would teach the system from noise. Kept in the
 * vocabulary so the outcome can still be recorded honestly.
 */
export const NON_CANDIDATE_REASONS: readonly RejectionReason[] = [
  "ROLE_CLOSED",
  "INTERNAL_CANDIDATE",
  "NO_REASON_GIVEN",
];

export const isCandidateSignal = (reason: RejectionReason): boolean =>
  !NON_CANDIDATE_REASONS.includes(reason);
