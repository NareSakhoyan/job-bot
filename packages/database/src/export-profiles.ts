import { mkdir, writeFile } from "node:fs/promises";
import {
  createLogger,
  educationCollectionSchema,
  experienceCollectionSchema,
  profilePath,
  userProfileSchema,
  type EducationInput,
  type ExperienceInput,
  type UserProfileInput,
} from "@job-bot/shared";
import { prisma } from "./client";

const logger = createLogger("database.export");

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Writes a profile from the database back to data/profiles/<slug>/.
 *
 * Editing happens in the dashboard, but the files remain the portable,
 * diffable, version-controllable copy. Exporting after an edit keeps them
 * honest — and everything written is re-validated against the same schemas
 * the importer uses, so an export can always be imported back.
 */
export const exportProfile = async (slug: string): Promise<string[]> => {
  const profile = await prisma.userProfile.findUnique({
    where: { slug },
    include: {
      skills: { orderBy: { name: "asc" } },
      experiences: {
        orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
        include: { projects: { orderBy: { name: "asc" } } },
      },
      education: { orderBy: { startDate: "desc" } },
    },
  });

  if (!profile) throw new Error(`No profile with slug "${slug}".`);

  const profileJson: UserProfileInput = userProfileSchema.parse({
    slug: profile.slug,
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    headline: profile.headline,
    summary: profile.summary,
    yearsOfExperience: profile.yearsOfExperience,
    targetRoles: profile.targetRoles,
    skills: profile.skills.map((skill) => ({
      name: skill.name,
      category: skill.category,
      level: skill.level,
      yearsUsed: skill.yearsUsed,
    })),
    preferredLocations: profile.preferredLocations,
    remotePreference: profile.remotePreference,
    salaryExpectation: {
      min: profile.salaryMin,
      max: profile.salaryMax,
      currency: profile.salaryCurrency,
      period: profile.salaryPeriod,
    },
    employmentTypes: profile.employmentTypes,
    industries: profile.industries,
    excludedCompanies: profile.excludedCompanies,
    excludedTechnologies: profile.excludedTechnologies,
    workAuthorization: {
      country: profile.workAuthCountry,
      status: profile.workAuthStatus,
      requiresSponsorship: profile.requiresSponsorship,
      notes: profile.workAuthNotes,
    },
    links: {
      github: profile.githubUrl,
      linkedin: profile.linkedinUrl,
      website: profile.websiteUrl,
    },
  });

  const experiencesJson: ExperienceInput[] = experienceCollectionSchema.parse(
    profile.experiences.map((experience) => ({
      slug: experience.slug,
      company: experience.company,
      role: experience.role,
      employmentType: experience.employmentType,
      location: experience.location,
      isRemote: experience.isRemote,
      startDate: isoDate(experience.startDate),
      endDate: experience.endDate === null ? null : isoDate(experience.endDate),
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
        url: project.url,
        impact: project.impact,
      })),
    })),
  );

  const educationJson: EducationInput[] = educationCollectionSchema.parse(
    profile.education.map((entry) => ({
      slug: entry.slug,
      institution: entry.institution,
      program: entry.program,
      kind: entry.kind,
      startDate: isoDate(entry.startDate),
      endDate: entry.endDate === null ? null : isoDate(entry.endDate),
      notes: entry.notes,
    })),
  );

  await mkdir(profilePath(slug), { recursive: true });

  const written: string[] = [];
  for (const [file, contents] of [
    ["profile.json", profileJson],
    ["experience.json", experiencesJson],
    ["education.json", educationJson],
  ] as const) {
    const path = profilePath(slug, file);
    await writeFile(path, `${JSON.stringify(contents, null, 2)}\n`, "utf8");
    written.push(path);
  }

  logger.info("Profile exported", { slug, files: written.length });
  return written;
};
