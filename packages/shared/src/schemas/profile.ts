import { z } from "zod";
import {
  EMPLOYMENT_TYPES,
  REMOTE_PREFERENCES,
  SKILL_LEVELS,
  SALARY_PERIODS,
  WORK_AUTHORIZATION_STATUSES,
} from "../enums";

const nonEmpty = z.string().trim().min(1);

export const profileSkillSchema = z.object({
  name: nonEmpty,
  category: nonEmpty,
  level: z.enum(SKILL_LEVELS),
  yearsUsed: z.number().min(0).max(60).nullable().default(null),
});

export const workAuthorizationSchema = z.object({
  country: nonEmpty,
  status: z.enum(WORK_AUTHORIZATION_STATUSES),
  requiresSponsorship: z.boolean(),
  notes: z.string().nullable().default(null),
});

export const salaryExpectationSchema = z.object({
  min: z.number().int().positive().nullable().default(null),
  max: z.number().int().positive().nullable().default(null),
  currency: z.string().length(3).default("USD"),
  period: z.enum(SALARY_PERIODS).default("YEAR"),
});

export const profileLinksSchema = z.object({
  github: z.string().url().nullable().default(null),
  linkedin: z.string().url().nullable().default(null),
  website: z.string().url().nullable().default(null),
});

/**
 * The editable profile document stored at data/profile/profile.json.
 * `slug` is the stable identity used for idempotent seeding.
 */
export const userProfileSchema = z
  .object({
    slug: nonEmpty,
    fullName: nonEmpty,
    email: z.string().email(),
    phone: z.string().nullable().default(null),
    location: nonEmpty,
    headline: nonEmpty,
    summary: nonEmpty,
    yearsOfExperience: z.number().min(0).max(60),
    targetRoles: z.array(nonEmpty).min(1),
    skills: z.array(profileSkillSchema).min(1),
    preferredLocations: z.array(nonEmpty),
    remotePreference: z.enum(REMOTE_PREFERENCES),
    salaryExpectation: salaryExpectationSchema,
    employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)).min(1),
    industries: z.array(nonEmpty).default([]),
    excludedCompanies: z.array(nonEmpty).default([]),
    excludedTechnologies: z.array(nonEmpty).default([]),
    workAuthorization: workAuthorizationSchema,
    links: profileLinksSchema,
  })
  .strict()
  .superRefine((profile, ctx) => {
    const { min, max } = profile.salaryExpectation;
    if (min !== null && max !== null && min > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["salaryExpectation"],
        message: "salaryExpectation.min cannot exceed salaryExpectation.max",
      });
    }
  });

export type ProfileSkillInput = z.infer<typeof profileSkillSchema>;
export type WorkAuthorizationInput = z.infer<typeof workAuthorizationSchema>;
export type SalaryExpectationInput = z.infer<typeof salaryExpectationSchema>;
export type UserProfileInput = z.infer<typeof userProfileSchema>;
