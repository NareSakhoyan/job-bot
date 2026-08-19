import type { EducationInput, ExperienceInput, UserProfileInput } from "@job-bot/shared";
import { prisma } from "../client";

/**
 * Writes for profile data.
 *
 * The database is the source of truth once a profile exists; the JSON files
 * under data/profiles/ are import and export formats. `exportProfiles` writes
 * the database back out so the files stay a faithful, version-controllable
 * copy of what the system actually believes.
 */

const profileFieldsFrom = (profile: UserProfileInput) => ({
  fullName: profile.fullName,
  email: profile.email,
  phone: profile.phone,
  location: profile.location,
  headline: profile.headline,
  summary: profile.summary,
  yearsOfExperience: profile.yearsOfExperience,
  targetRoles: profile.targetRoles,
  preferredLocations: profile.preferredLocations,
  remotePreference: profile.remotePreference,
  employmentTypes: profile.employmentTypes,
  industries: profile.industries,
  excludedCompanies: profile.excludedCompanies,
  excludedTechnologies: profile.excludedTechnologies,
  salaryMin: profile.salaryExpectation.min,
  salaryMax: profile.salaryExpectation.max,
  salaryCurrency: profile.salaryExpectation.currency,
  salaryPeriod: profile.salaryExpectation.period,
  workAuthCountry: profile.workAuthorization.country,
  workAuthStatus: profile.workAuthorization.status,
  requiresSponsorship: profile.workAuthorization.requiresSponsorship,
  workAuthNotes: profile.workAuthorization.notes,
  githubUrl: profile.links.github,
  linkedinUrl: profile.links.linkedin,
  websiteUrl: profile.links.website,
});

/** Replaces every editable field on a profile, plus its skill list. */
export const saveProfile = async (profile: UserProfileInput) => {
  const data = profileFieldsFrom(profile);

  const record = await prisma.userProfile.upsert({
    where: { slug: profile.slug },
    create: { slug: profile.slug, ...data },
    update: data,
  });

  // Skills are owned wholesale by the submitted list, so a removed row goes.
  await prisma.profileSkill.deleteMany({ where: { profileId: record.id } });
  if (profile.skills.length > 0) {
    await prisma.profileSkill.createMany({
      data: profile.skills.map((skill) => ({
        profileId: record.id,
        name: skill.name,
        category: skill.category,
        level: skill.level,
        yearsUsed: skill.yearsUsed,
      })),
    });
  }

  return record;
};

const experienceFieldsFrom = (experience: ExperienceInput, profileId: string) => ({
  profileId,
  company: experience.company,
  role: experience.role,
  employmentType: experience.employmentType,
  location: experience.location,
  isRemote: experience.isRemote,
  startDate: new Date(experience.startDate),
  endDate: experience.endDate ? new Date(experience.endDate) : null,
  isCurrent: experience.isCurrent,
  description: experience.description,
  technologies: experience.technologies,
  responsibilities: experience.responsibilities,
  achievements: experience.achievements,
});

/** Creates or replaces one experience and the projects beneath it. */
export const saveExperience = async (profileId: string, experience: ExperienceInput) => {
  const data = experienceFieldsFrom(experience, profileId);

  const saved = await prisma.experience.upsert({
    where: { slug: experience.slug },
    create: { slug: experience.slug, ...data },
    update: data,
  });

  await prisma.experienceProject.deleteMany({ where: { experienceId: saved.id } });
  if (experience.projects.length > 0) {
    await prisma.experienceProject.createMany({
      data: experience.projects.map((project) => ({
        experienceId: saved.id,
        slug: project.slug,
        name: project.name,
        description: project.description,
        technologies: project.technologies,
        url: project.url,
        impact: project.impact,
      })),
    });
  }

  return saved;
};

export const deleteExperience = async (id: string) =>
  prisma.experience.delete({ where: { id } });

/** Replaces a profile's whole education list. */
export const saveEducation = async (profileId: string, entries: EducationInput[]) => {
  await prisma.education.deleteMany({ where: { profileId } });
  if (entries.length === 0) return;

  await prisma.education.createMany({
    data: entries.map((entry) => ({
      profileId,
      slug: entry.slug,
      institution: entry.institution,
      program: entry.program,
      kind: entry.kind,
      startDate: new Date(entry.startDate),
      endDate: entry.endDate ? new Date(entry.endDate) : null,
      notes: entry.notes,
    })),
  });
};
