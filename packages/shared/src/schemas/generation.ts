import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

/**
 * A single resume bullet, carrying its own provenance.
 *
 * `sourceText` must appear verbatim in the recorded experience; `text` is the
 * rewritten version. This is what makes fabrication checkable rather than
 * merely discouraged: a bullet whose source cannot be found in the experience
 * database is rejected before it reaches a document.
 */
export const resumeBulletSchema = z
  .object({
    experienceSlug: nonEmpty,
    sourceText: nonEmpty,
    text: nonEmpty,
  })
  .strict();

export const resumeSectionSchema = z
  .object({
    experienceSlug: nonEmpty,
    bullets: z.array(resumeBulletSchema).min(1),
  })
  .strict();

/** What the model is asked to return when tailoring a resume. */
export const resumeDraftSchema = z
  .object({
    summary: nonEmpty,
    highlightedSkills: z.array(nonEmpty),
    sections: z.array(resumeSectionSchema),
    missingInformation: z.array(nonEmpty),
  })
  .strict();

export const coverLetterDraftSchema = z
  .object({
    body: nonEmpty,
    /** Experiences the letter draws on, so its claims can be traced. */
    citedExperienceSlugs: z.array(nonEmpty),
    missingInformation: z.array(nonEmpty),
  })
  .strict();

export type ResumeBullet = z.infer<typeof resumeBulletSchema>;
export type ResumeSection = z.infer<typeof resumeSectionSchema>;
export type ResumeDraft = z.infer<typeof resumeDraftSchema>;
export type CoverLetterDraft = z.infer<typeof coverLetterDraftSchema>;
