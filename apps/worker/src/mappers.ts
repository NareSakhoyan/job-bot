import { extractCompanySize, resolveCompanyProfile, type CompanyProfile } from "@job-bot/jobs";
import type { MatchJob, MatchProfile } from "@job-bot/shared";
import type { MatchableJob, ProfileWithRelations } from "@job-bot/database";
import type { SourceProfile, TargetJob } from "@job-bot/resume";

/**
 * Converts persisted records into the pure inputs the scorer expects. This is
 * the single place the database shape meets the matching domain, so
 * @job-bot/matching stays free of Prisma types.
 */
export const toMatchProfile = (profile: ProfileWithRelations): MatchProfile => ({
  yearsOfExperience: profile.yearsOfExperience,
  targetRoles: profile.targetRoles,
  skills: profile.skills.map((skill) => ({ name: skill.name, level: skill.level })),
  experienceTechnologies: [
    ...new Set(profile.experiences.flatMap((experience) => experience.technologies)),
  ],
  preferredLocations: profile.preferredLocations,
  remotePreference: profile.remotePreference,
  salaryMin: profile.salaryMin,
  salaryMax: profile.salaryMax,
  salaryCurrency: profile.salaryCurrency,
  salaryPeriod: profile.salaryPeriod,
  employmentTypes: profile.employmentTypes,
  excludedCompanies: profile.excludedCompanies,
  excludedTechnologies: profile.excludedTechnologies,
  requiresSponsorship: profile.requiresSponsorship,
  workAuthCountry: profile.workAuthCountry,
  willRelocate: profile.willRelocate,
});

export const toMatchJob = (
  job: MatchableJob,
  companies: readonly CompanyProfile[] = [],
): MatchJob => ({
  company: job.company,
  title: job.title,
  location: job.location,
  isRemote: job.isRemote,
  employmentType: job.employmentType,
  salaryMin: job.salaryMin,
  salaryMax: job.salaryMax,
  salaryCurrency: job.salaryCurrency,
  salaryPeriod: job.salaryPeriod,
  requirements: job.requirements,
  technologies: job.technologies,
  descriptionText: job.descriptionText,
  // A hand-recorded size wins; otherwise read what the posting says about
  // itself. Most employers in an aggregator feed will never be in the file,
  // and their own description is the only size evidence available.
  companySize:
    resolveCompanyProfile(job.company, companies)?.size ??
    extractCompanySize(job.descriptionText)?.size ??
    null,
});

/**
 * Converts a persisted profile into the fact base the generation agents may
 * draw on. Nothing outside this structure reaches a prompt.
 */
export const toSourceProfile = (profile: ProfileWithRelations): SourceProfile => ({
  slug: profile.slug,
  fullName: profile.fullName,
  headline: profile.headline,
  summary: profile.summary,
  yearsOfExperience: profile.yearsOfExperience,
  skills: profile.skills.map((skill) => ({ name: skill.name, level: skill.level })),
  experiences: profile.experiences.map((experience) => ({
    slug: experience.slug,
    company: experience.company,
    role: experience.role,
    employmentType: experience.employmentType,
    location: experience.location,
    isRemote: experience.isRemote,
    startDate: experience.startDate,
    endDate: experience.endDate,
    isCurrent: experience.isCurrent,
    description: experience.description,
    technologies: experience.technologies,
    responsibilities: experience.responsibilities,
    achievements: experience.achievements,
    projects: experience.projects.map((project) => ({
      slug: project.slug,
      name: project.name,
      description: project.description,
      technologies: project.technologies,
      impact: project.impact,
    })),
  })),
});

export const toTargetJob = (job: {
  company: string;
  title: string;
  technologies: string[];
  requirements: string[];
  descriptionText: string;
}): TargetJob => ({
  company: job.company,
  title: job.title,
  technologies: job.technologies,
  requirements: job.requirements,
  descriptionText: job.descriptionText,
});
