/**
 * What the employer sees when the file lands in their ATS.
 *
 * The attachment keeps its filename all the way into a recruiter's inbox, so
 * it is part of the application rather than an implementation detail. A name
 * built from a database id — `resume-cmsyyqixj00a9fmd2v521xylo.pdf` — reads
 * exactly like what it is: machine output.
 *
 * Uniqueness belongs to the directory, not the filename. Two applications may
 * legitimately produce the same document name, and disambiguating them by
 * mangling what the recruiter reads is the wrong trade.
 */

/** Characters no filesystem should carry, plus control codes. */
const UNSAFE = /[\x00-\x1f<>:"/\\|?*]/g;

/** Capped so a long title cannot hit a path-length limit. */
const MAX_STEM = 90;

const tidy = (value: string): string =>
  value
    .replace(UNSAFE, " ")
    .replace(/\s+/g, " ")
    .trim()
    // A trailing dot or space is invalid on Windows and invisible everywhere.
    .replace(/^[.\s]+|[.\s]+$/g, "");

/**
 * `Ada Lovelace - Frontend Engineer.pdf`
 *
 * Falls back to the person's name alone when the role is unusable, and to
 * "Resume" when even that is: an awkward filename beats throwing at the point
 * where a file is about to be uploaded.
 */
export const resumeFileName = (
  fullName: string,
  jobTitle: string,
  extension: "pdf" | "md" = "pdf",
): string => {
  const person = tidy(fullName);
  const role = tidy(jobTitle);

  const stem = [person, role].filter((part) => part.length > 0).join(" - ") || "Resume";
  const capped = stem.length > MAX_STEM ? tidy(stem.slice(0, MAX_STEM)) : stem;

  return `${capped || "Resume"}.${extension}`;
};
