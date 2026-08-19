import { z } from "zod";
import { COMPANY_SIZES, EMPLOYMENT_TYPES, REMOTE_PREFERENCES, SALARY_PERIODS, SKILL_LEVELS } from "../enums";

const nonEmpty = z.string().trim().min(1);

/**
 * The projection of a profile that the scorer needs. Defined here rather than
 * imported from the database package so @job-bot/matching stays pure and
 * trivially testable — it never touches Prisma.
 */
export const matchProfileSchema = z
  .object({
    yearsOfExperience: z.number().min(0),
    targetRoles: z.array(nonEmpty),
    skills: z.array(z.object({ name: nonEmpty, level: z.enum(SKILL_LEVELS) })),
    /** Every technology recorded across the experience history. */
    experienceTechnologies: z.array(nonEmpty),
    preferredLocations: z.array(nonEmpty),
    remotePreference: z.enum(REMOTE_PREFERENCES),
    salaryMin: z.number().int().positive().nullable(),
    salaryMax: z.number().int().positive().nullable(),
    salaryCurrency: z.string(),
    salaryPeriod: z.enum(SALARY_PERIODS),
    employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)),
    excludedCompanies: z.array(nonEmpty),
    excludedTechnologies: z.array(nonEmpty),
    requiresSponsorship: z.boolean(),
    /** Where the candidate already holds the right to work. */
    workAuthCountry: z.string(),
    /** Whether an on-site role abroad is on the table at all. */
    willRelocate: z.boolean(),
  })
  .strict();

/** The projection of a job that the scorer needs. */
export const matchJobSchema = z
  .object({
    company: nonEmpty,
    title: nonEmpty,
    location: nonEmpty,
    isRemote: z.boolean(),
    employmentType: z.enum(EMPLOYMENT_TYPES).nullable(),
    salaryMin: z.number().int().positive().nullable(),
    salaryMax: z.number().int().positive().nullable(),
    salaryCurrency: z.string().nullable(),
    salaryPeriod: z.enum(SALARY_PERIODS).nullable(),
    requirements: z.array(z.string()),
    technologies: z.array(z.string()),
    descriptionText: z.string(),
    /** Employer size band, or null when the employer is not recorded. */
    companySize: z.enum(COMPANY_SIZES).nullable(),
  })
  .strict();

export type MatchProfile = z.infer<typeof matchProfileSchema>;
export type MatchJob = z.infer<typeof matchJobSchema>;
