import { normalizeText } from "@job-bot/jobs";
import type { SourceExperience, SourceProfile, TargetJob } from "./types";

export interface RankedExperience {
  experience: SourceExperience;
  /** 0-100 relevance to the posting. */
  relevance: number;
  /** Technologies shared between this role and the posting. */
  overlap: string[];
}

const tokenSet = (values: string[]): Set<string> =>
  new Set(values.flatMap((value) => normalizeText(value).split(" ")).filter((t) => t.length > 2));

/**
 * Ranks recorded experience against a posting.
 *
 * Selection is deterministic on purpose. Deciding *which* real experience is
 * relevant is a matching problem, not a writing problem — leaving it to the
 * model invites it to reach for whatever sounds best. The model is handed the
 * ranked shortlist and only writes prose about it.
 */
export const rankExperiences = (profile: SourceProfile, job: TargetJob): RankedExperience[] => {
  const jobTech = new Set(job.technologies.map(normalizeText));
  const jobWords = tokenSet([job.title, ...job.requirements, job.descriptionText.slice(0, 4000)]);

  const ranked = profile.experiences.map((experience) => {
    const overlap = experience.technologies.filter((technology) =>
      jobTech.has(normalizeText(technology)),
    );

    const techScore = jobTech.size === 0 ? 0 : (overlap.length / jobTech.size) * 100;

    const roleWords = tokenSet([experience.role]);
    const roleScore =
      roleWords.size === 0
        ? 0
        : ([...roleWords].filter((word) => jobWords.has(word)).length / roleWords.size) * 100;

    // Recent work counts for more; a role from six years ago is weaker
    // evidence than the same role last year.
    const endedAt = experience.endDate ?? new Date();
    const yearsAgo = (Date.now() - endedAt.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const recency = Math.max(0, 100 - yearsAgo * 12);

    const relevance = Math.round(techScore * 0.55 + roleScore * 0.25 + recency * 0.2);

    return { experience, relevance: Math.min(100, relevance), overlap };
  });

  return ranked.sort((a, b) => b.relevance - a.relevance);
};

/** The most relevant experiences, always keeping at least the top two. */
export const selectExperiences = (
  profile: SourceProfile,
  job: TargetJob,
  limit = 4,
): RankedExperience[] => {
  const ranked = rankExperiences(profile, job);
  return ranked.slice(0, Math.max(2, Math.min(limit, ranked.length)));
};

/**
 * Profile skills the posting asks for, most relevant first, followed by the
 * rest. Reordering only — nothing is added.
 */
export const orderSkillsForJob = (profile: SourceProfile, job: TargetJob): string[] => {
  const jobTech = new Set(job.technologies.map(normalizeText));
  const relevant = profile.skills.filter((skill) => jobTech.has(normalizeText(skill.name)));
  const rest = profile.skills.filter((skill) => !jobTech.has(normalizeText(skill.name)));
  return [...relevant, ...rest].map((skill) => skill.name);
};
