import { z } from "zod";
import { EDUCATION_KINDS } from "../enums";

const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)");

/**
 * Degrees, courses and certifications. Application forms ask about these
 * directly, so they are stored as structured facts rather than prose.
 */
export const educationSchema = z
  .object({
    slug: nonEmpty,
    institution: nonEmpty,
    program: nonEmpty,
    kind: z.enum(EDUCATION_KINDS),
    startDate: isoDate,
    endDate: isoDate.nullable().default(null),
    notes: z.string().nullable().default(null),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.endDate !== null && entry.endDate < entry.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "endDate cannot be before startDate",
      });
    }
  });

export const educationCollectionSchema = z.array(educationSchema);

export type EducationInput = z.infer<typeof educationSchema>;
