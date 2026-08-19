import { readFile } from "node:fs/promises";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  createLogger,
  dataPath,
  listProfileSlugs,
  profilePath,
  educationCollectionSchema,
  experienceCollectionSchema,
  userProfileSchema,
  type EducationInput,
  type ExperienceInput,
  loadRootEnv,
  type UserProfileInput,
} from "@job-bot/shared";
import { MockJobSource, discoverJobs } from "@job-bot/jobs";
import { z } from "zod";

loadRootEnv();

const logger = createLogger("seed");
const prisma = new PrismaClient();

const SEED_ACTOR = "seed";

const readJsonFile = async <S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  label: string,
): Promise<z.output<S>> => {
  const contents = await readFile(path, "utf8");
  const parsed = schema.safeParse(JSON.parse(contents));

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - [${issue.path.join(".") || "root"}] ${issue.message}`)
      .join("\n");
    throw new Error(`${label} failed validation (${path}):\n${details}`);
  }

  return parsed.data;
};

const seedProfile = async (
  profile: UserProfileInput,
  experiences: ExperienceInput[],
  education: EducationInput[],
) => {
  // `slug` is the identity: the directory name and the database key agree,
  // so re-seeding updates in place no matter how many CVs are present.
  const profileData = {
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
  } satisfies Omit<Prisma.UserProfileCreateInput, "slug">;

  const record = await prisma.userProfile.upsert({
    where: { slug: profile.slug },
    create: { slug: profile.slug, ...profileData },
    update: profileData,
  });

  // Skills and projects are fully owned by the JSON files, so removing an
  // entry from the file must remove it from the database too.
  await prisma.profileSkill.deleteMany({ where: { profileId: record.id } });
  await prisma.profileSkill.createMany({
    data: profile.skills.map((skill) => ({
      profileId: record.id,
      name: skill.name,
      category: skill.category,
      level: skill.level,
      yearsUsed: skill.yearsUsed,
    })),
  });

  const keptSlugs = experiences.map((experience) => experience.slug);
  await prisma.experience.deleteMany({
    where: { profileId: record.id, slug: { notIn: keptSlugs } },
  });

  for (const experience of experiences) {
    const experienceData = {
      profileId: record.id,
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
    };

    const saved = await prisma.experience.upsert({
      where: { slug: experience.slug },
      create: { slug: experience.slug, ...experienceData },
      update: experienceData,
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
  }

  const keptEducationSlugs = education.map((entry) => entry.slug);
  await prisma.education.deleteMany({
    where: { profileId: record.id, slug: { notIn: keptEducationSlugs } },
  });

  for (const entry of education) {
    const educationData = {
      profileId: record.id,
      institution: entry.institution,
      program: entry.program,
      kind: entry.kind,
      startDate: new Date(entry.startDate),
      endDate: entry.endDate ? new Date(entry.endDate) : null,
      notes: entry.notes,
    };

    await prisma.education.upsert({
      where: { slug: entry.slug },
      create: { slug: entry.slug, ...educationData },
      update: educationData,
    });
  }

  logger.info("Profile seeded", {
    profile: profile.slug,
    skills: profile.skills.length,
    experiences: experiences.length,
    education: education.length,
  });

  return record;
};

const seedJobs = async (profileIds: string[]) => {
  const source = new MockJobSource();
  const outcome = await discoverJobs([source], { limit: 200 });

  for (const { job, duplicates } of outcome.jobs) {
    const jobData = {
      company: job.company,
      title: job.title,
      location: job.location,
      isRemote: job.isRemote,
      employmentType: job.employmentType,
      salaryMin: job.salary?.min ?? null,
      salaryMax: job.salary?.max ?? null,
      salaryCurrency: job.salary?.currency ?? null,
      salaryPeriod: job.salary?.period ?? null,
      description: job.description,
      descriptionText: job.descriptionText,
      requirements: job.requirements,
      responsibilities: job.responsibilities,
      technologies: job.technologies,
      postedAt: job.postedAt ? new Date(job.postedAt) : null,
      url: job.url,
      primarySource: job.source,
    };

    const saved = await prisma.job.upsert({
      where: { dedupeKey: job.dedupeKey },
      create: { dedupeKey: job.dedupeKey, ...jobData },
      update: jobData,
    });

    // Every sighting of the posting, including the one that created the Job.
    for (const sighting of [job, ...duplicates]) {
      await prisma.jobSighting.upsert({
        where: {
          source_externalId: { source: sighting.source, externalId: sighting.externalId },
        },
        create: {
          jobId: saved.id,
          source: sighting.source,
          externalId: sighting.externalId,
          url: sighting.url,
          rawPayload: sighting as unknown as Prisma.InputJsonValue,
        },
        update: { jobId: saved.id, url: sighting.url, lastSeenAt: new Date() },
      });
    }

    // Each profile tracks the job through its own pipeline.
    for (const profileId of profileIds) {
      const existing = await prisma.application.findUnique({
        where: { profileId_jobId: { profileId, jobId: saved.id } },
      });
      if (existing) continue;

      await prisma.application.create({
        data: {
          profileId,
          jobId: saved.id,
          status: "DISCOVERED",
          events: {
            create: {
              type: "STATUS_CHANGED",
              toStatus: "DISCOVERED",
              actor: SEED_ACTOR,
              message: `Discovered via ${job.source}`,
              metadata: { dedupeKey: job.dedupeKey, duplicateSightings: duplicates.length },
            },
          },
        },
      });
    }
  }

  logger.info("Jobs seeded", {
    distinct: outcome.jobs.length,
    duplicatesCollapsed: outcome.duplicateCount,
    bySource: outcome.bySource,
  });

  return outcome;
};

const main = async () => {
  // The dashboard is now the place profiles are edited, so importing a file
  // over a profile that already exists would silently discard those edits.
  // Re-import explicitly with `pnpm db:seed --force`.
  const force = process.argv.includes("--force");
  const slugs = listProfileSlugs();
  if (slugs.length === 0) {
    throw new Error("No profiles found under data/profiles/. Each CV needs its own directory.");
  }

  logger.info("Seed started", { dataDir: dataPath(), profiles: slugs });

  const profileIds: string[] = [];

  for (const slug of slugs) {
    const existing = await prisma.userProfile.findUnique({ where: { slug } });
    if (existing && !force) {
      profileIds.push(existing.id);
      logger.info("Profile already present; skipping import", { slug });
      continue;
    }

    const [profile, experiences, education] = await Promise.all([
      readJsonFile(profilePath(slug, "profile.json"), userProfileSchema, `Profile (${slug})`),
      readJsonFile(
        profilePath(slug, "experience.json"),
        experienceCollectionSchema,
        `Experience (${slug})`,
      ),
      readJsonFile(
        profilePath(slug, "education.json"),
        educationCollectionSchema,
        `Education (${slug})`,
      ),
    ]);

    if (profile.slug !== slug) {
      throw new Error(
        `data/profiles/${slug}/profile.json declares slug "${profile.slug}"; it must match the directory name.`,
      );
    }

    const record = await seedProfile(profile, experiences, education);
    profileIds.push(record.id);
  }

  await seedJobs(profileIds);

  logger.info("Seed completed", { profiles: profileIds.length });
};

main()
  .catch((error: unknown) => {
    logger.error("Seed failed", { error: error instanceof Error ? error.message : String(error) });
    if (error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
