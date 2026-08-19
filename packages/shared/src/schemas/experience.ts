import { z } from "zod";
import { EMPLOYMENT_TYPES } from "../enums";

const nonEmpty = z.string().trim().min(1);

/** ISO date, or `null` for a role that is still current. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)");

export const experienceProjectSchema = z
  .object({
    slug: nonEmpty,
    name: nonEmpty,
    description: nonEmpty,
    technologies: z.array(nonEmpty).default([]),
    url: z.string().url().nullable().default(null),
    impact: z.string().nullable().default(null),
  })
  .strict();

/**
 * A real, verifiable position. This collection is the ONLY corpus the resume
 * and question agents may draw from — nothing outside it may ever be claimed.
 */
export const experienceSchema = z
  .object({
    slug: nonEmpty,
    company: nonEmpty,
    role: nonEmpty,
    employmentType: z.enum(EMPLOYMENT_TYPES),
    location: nonEmpty,
    isRemote: z.boolean().default(false),
    startDate: isoDate,
    endDate: isoDate.nullable().default(null),
    isCurrent: z.boolean().default(false),
    description: nonEmpty,
    technologies: z.array(nonEmpty).default([]),
    responsibilities: z.array(nonEmpty).default([]),
    achievements: z.array(nonEmpty).default([]),
    projects: z.array(experienceProjectSchema).default([]),
  })
  .strict()
  .superRefine((experience, ctx) => {
    if (experience.isCurrent && experience.endDate !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "A current role must not have an endDate",
      });
    }
    if (!experience.isCurrent && experience.endDate === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "A past role must have an endDate",
      });
    }
    if (experience.endDate !== null && experience.endDate < experience.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "endDate cannot be before startDate",
      });
    }
  });

export const experienceCollectionSchema = z.array(experienceSchema);

export type ExperienceProjectInput = z.infer<typeof experienceProjectSchema>;
export type ExperienceInput = z.infer<typeof experienceSchema>;
