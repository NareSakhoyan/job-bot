import { z } from "zod";
import { EXPERIENCE_STRENGTHS } from "../enums";

const nonEmpty = z.string().trim().min(1);

/**
 * An answer generated for an application question. `strength` and
 * `sourceExperienceSlugs` exist so that every claim is traceable back to a real
 * entry in the experience database, and `missingInformation` makes gaps
 * explicit instead of letting the model paper over them.
 */
export const applicationAnswerSchema = z
  .object({
    question: nonEmpty,
    answer: z.string(),
    strength: z.enum(EXPERIENCE_STRENGTHS),
    sourceExperienceSlugs: z.array(nonEmpty).default([]),
    missingInformation: z.array(nonEmpty).default([]),
    requiresHumanInput: z.boolean().default(false),
  })
  .strict();

export const applicationAnswersSchema = z.array(applicationAnswerSchema);

/** Structured tailored resume. Populated in Phase 3. */
export const tailoredResumeSchema = z
  .object({
    summary: z.string(),
    highlightedSkills: z.array(nonEmpty).default([]),
    selectedExperienceSlugs: z.array(nonEmpty).default([]),
    selectedProjectSlugs: z.array(nonEmpty).default([]),
    missingInformation: z.array(nonEmpty).default([]),
    markdown: z.string(),
  })
  .strict();

export type ApplicationAnswer = z.infer<typeof applicationAnswerSchema>;
export type TailoredResume = z.infer<typeof tailoredResumeSchema>;
