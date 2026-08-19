"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  deleteExperience,
  exportProfile,
  prisma,
  saveEducation,
  saveExperience,
  saveProfile,
} from "@job-bot/database";
import {
  createLogger,
  educationCollectionSchema,
  experienceSchema,
  userProfileSchema,
} from "@job-bot/shared";
import {
  readBoolean,
  readColumns,
  readCsv,
  readLines,
  readNumber,
  readOptional,
  readString,
  toSlug,
} from "@/lib/form-parse";

const logger = createLogger("web.profile");

/**
 * Turns a Zod failure into something a person can act on. Server actions have
 * no natural error channel, so the message rides back on the query string and
 * the form renders it above the fields.
 */
const describe = (error: z.ZodError): string =>
  error.issues
    .map((issue: z.ZodIssue) => `${issue.path.join(".") || "form"}: ${issue.message}`)
    .join("\n");

// `redirect` throws, so every call site returns immediately — which is also
// what lets TypeScript narrow the parse result on the following line.
const back = (path: string, slug: string, error?: string): void => {
  redirect(
    `${path}?profile=${encodeURIComponent(slug)}${error ? `&error=${encodeURIComponent(error)}` : "&saved=1"}`,
  );
};

/** Saves every profile-level field, including the skill list. */
export const updateProfile = async (form: FormData): Promise<void> => {
  const slug = readString(form, "slug");

  const skills = readColumns(form, "skills", 4).map(([name, category, level, years]) => ({
    name: name ?? "",
    category: (category ?? "").length === 0 ? "General" : category,
    level: (level ?? "").toUpperCase(),
    yearsUsed: (years ?? "").length === 0 ? null : Number(years),
  }));

  const candidate = {
    slug,
    fullName: readString(form, "fullName"),
    email: readString(form, "email"),
    phone: readOptional(form, "phone"),
    location: readString(form, "location"),
    headline: readString(form, "headline"),
    summary: readString(form, "summary"),
    yearsOfExperience: readNumber(form, "yearsOfExperience") ?? 0,
    targetRoles: readLines(form, "targetRoles"),
    skills,
    preferredLocations: readLines(form, "preferredLocations"),
    remotePreference: readString(form, "remotePreference"),
    salaryExpectation: {
      min: readNumber(form, "salaryMin"),
      max: readNumber(form, "salaryMax"),
      currency: readString(form, "salaryCurrency") || "USD",
      period: readString(form, "salaryPeriod") || "YEAR",
    },
    employmentTypes: form.getAll("employmentTypes").map(String),
    industries: readLines(form, "industries"),
    excludedCompanies: readLines(form, "excludedCompanies"),
    excludedTechnologies: readLines(form, "excludedTechnologies"),
    workAuthorization: {
      country: readString(form, "workAuthCountry"),
      status: readString(form, "workAuthStatus"),
      requiresSponsorship: readBoolean(form, "requiresSponsorship"),
      notes: readOptional(form, "workAuthNotes"),
    },
    links: {
      github: readOptional(form, "githubUrl"),
      linkedin: readOptional(form, "linkedinUrl"),
      website: readOptional(form, "websiteUrl"),
    },
  };

  const parsed = userProfileSchema.safeParse(candidate);
  if (!parsed.success) return back("/profile/edit", slug, describe(parsed.error));

  await saveProfile(parsed.data);
  logger.info("Profile updated", { slug, skills: parsed.data.skills.length });

  revalidatePath("/profile");
  return back("/profile/edit", slug);
};

/** Saves the profile's whole education list in one submission. */
export const updateEducation = async (form: FormData): Promise<void> => {
  const slug = readString(form, "slug");

  const entries = readColumns(form, "education", 5).map(
    ([institution, program, kind, start, end]) => ({
      slug: toSlug(slug, institution ?? "", program ?? ""),
      institution: institution ?? "",
      program: program ?? "",
      kind: (kind ?? "COURSE").toUpperCase(),
      startDate: start ?? "",
      endDate: (end ?? "").length === 0 ? null : end,
      notes: null,
    }),
  );

  const parsed = educationCollectionSchema.safeParse(entries);
  if (!parsed.success) return back("/profile/edit", slug, describe(parsed.error));

  const profile = await prisma.userProfile.findUniqueOrThrow({ where: { slug } });
  await saveEducation(profile.id, parsed.data);
  logger.info("Education updated", { slug, entries: parsed.data.length });

  revalidatePath("/profile");
  return back("/profile/edit", slug);
};

/** Creates or updates one experience, including its projects. */
export const updateExperience = async (form: FormData): Promise<void> => {
  const slug = readString(form, "profileSlug");
  const company = readString(form, "company");
  const role = readString(form, "role");

  const existingSlug = readOptional(form, "experienceSlug");
  const isCurrent = readBoolean(form, "isCurrent");

  const projects = readColumns(form, "projects", 5).map(
    ([name, description, technologies, impact, url]) => ({
      slug: toSlug(slug, company, name ?? ""),
      name: name ?? "",
      description: description ?? "",
      technologies: (technologies ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
      impact: (impact ?? "").length === 0 ? null : impact,
      url: (url ?? "").length === 0 ? null : url,
    }),
  );

  const candidate = {
    slug: existingSlug ?? toSlug(slug, company, role),
    company,
    role,
    employmentType: readString(form, "employmentType"),
    location: readString(form, "location"),
    isRemote: readBoolean(form, "isRemote"),
    startDate: readString(form, "startDate"),
    endDate: isCurrent ? null : readOptional(form, "endDate"),
    isCurrent,
    description: readString(form, "description"),
    technologies: readCsv(form, "technologies"),
    responsibilities: readLines(form, "responsibilities"),
    achievements: readLines(form, "achievements"),
    projects,
  };

  const parsed = experienceSchema.safeParse(candidate);
  if (!parsed.success) {
    return back(`/profile/experience/${existingSlug ?? "new"}`, slug, describe(parsed.error));
  }

  const profile = await prisma.userProfile.findUniqueOrThrow({ where: { slug } });
  await saveExperience(profile.id, parsed.data);
  logger.info("Experience saved", { slug, experience: parsed.data.slug });

  revalidatePath("/profile");
  redirect(`/profile?profile=${encodeURIComponent(slug)}&saved=1`);
};

export const removeExperience = async (form: FormData): Promise<void> => {
  const slug = readString(form, "profileSlug");
  const id = readString(form, "experienceId");

  await deleteExperience(id);
  logger.info("Experience removed", { slug, id });

  revalidatePath("/profile");
  redirect(`/profile?profile=${encodeURIComponent(slug)}&saved=1`);
};

/**
 * Writes the profile back to data/profiles/<slug>/. Editing lives in the
 * dashboard; this keeps the files a faithful, diffable copy.
 */
export const exportProfileToFiles = async (form: FormData): Promise<void> => {
  const slug = readString(form, "slug");
  const written = await exportProfile(slug);
  logger.info("Profile exported to files", { slug, files: written.length });

  redirect(`/profile?profile=${encodeURIComponent(slug)}&exported=${written.length}`);
};
