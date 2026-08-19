import { z } from "zod";
import { EMPLOYMENT_TYPES, SALARY_PERIODS } from "../enums";

const nonEmpty = z.string().trim().min(1);

export const salaryRangeSchema = z
  .object({
    min: z.number().int().positive().nullable().default(null),
    max: z.number().int().positive().nullable().default(null),
    currency: z.string().length(3).default("USD"),
    period: z.enum(SALARY_PERIODS).default("YEAR"),
  })
  .strict();

/**
 * A job exactly as a JobSource reports it, before normalization or dedup.
 * Every adapter must produce this shape, so the rest of the system never sees
 * source-specific payloads.
 */
export const rawJobSchema = z
  .object({
    source: nonEmpty,
    externalId: nonEmpty,
    url: z.string().url(),
    company: nonEmpty,
    title: nonEmpty,
    location: nonEmpty,
    isRemote: z.boolean().default(false),
    employmentType: z.enum(EMPLOYMENT_TYPES).nullable().default(null),
    salary: salaryRangeSchema.nullable().default(null),
    description: nonEmpty,
    requirements: z.array(nonEmpty).default([]),
    responsibilities: z.array(nonEmpty).default([]),
    technologies: z.array(nonEmpty).default([]),
    postedAt: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .strict();

export const rawJobCollectionSchema = z.array(rawJobSchema);

/** A raw job plus the derived fields computed by the normalization step. */
export const normalizedJobSchema = rawJobSchema.extend({
  dedupeKey: nonEmpty,
  descriptionText: nonEmpty,
});

/** Query passed to every JobSource implementation. */
export const jobSearchQuerySchema = z
  .object({
    keywords: z.array(nonEmpty).default([]),
    locations: z.array(nonEmpty).default([]),
    remoteOnly: z.boolean().default(false),
    employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)).default([]),
    minSalary: z.number().int().positive().nullable().default(null),
    postedWithinDays: z.number().int().positive().nullable().default(null),
    /**
     * Discovery now runs one union query for every profile rather than one per
     * profile, so a single call legitimately spans every configured board.
     * The cap still exists to catch a runaway value.
     */
    limit: z.number().int().positive().max(5000).default(100),
  })
  .strict();

export type SalaryRange = z.infer<typeof salaryRangeSchema>;
export type RawJob = z.infer<typeof rawJobSchema>;
export type NormalizedJob = z.infer<typeof normalizedJobSchema>;
export type JobSearchQuery = z.infer<typeof jobSearchQuerySchema>;
export type JobSearchQueryInput = z.input<typeof jobSearchQuerySchema>;
