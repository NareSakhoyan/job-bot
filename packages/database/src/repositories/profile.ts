import type { Prisma } from "@prisma/client";
import { prisma } from "../client";

const profileInclude = {
  skills: { orderBy: [{ level: "asc" }, { name: "asc" }] },
  experiences: {
    orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
    include: { projects: { orderBy: { name: "asc" } } },
  },
  education: { orderBy: [{ startDate: "desc" }] },
} satisfies Prisma.UserProfileInclude;

/**
 * Every profile the system knows about. The application is multi-CV: one
 * person can search under several profiles, and matches and applications are
 * scoped to whichever profile they were produced for.
 */
export const listProfiles = async () =>
  prisma.userProfile.findMany({
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, slug: true, fullName: true, headline: true },
  });

export const getProfileBySlug = async (slug: string) =>
  prisma.userProfile.findUnique({ where: { slug }, include: profileInclude });

/** The profile to use when none was named — the oldest one. */
export const getDefaultProfile = async () =>
  prisma.userProfile.findFirst({ orderBy: [{ createdAt: "asc" }], include: profileInclude });

/**
 * Resolves a profile by slug, falling back to the default. Returns null only
 * when there is no profile at all.
 */
export const resolveProfile = async (slug?: string | null) => {
  if (slug) {
    const bySlug = await getProfileBySlug(slug);
    if (bySlug) return bySlug;
  }
  return getDefaultProfile();
};

export type ProfileWithRelations = NonNullable<Awaited<ReturnType<typeof getDefaultProfile>>>;
export type ProfileSummary = Awaited<ReturnType<typeof listProfiles>>[number];
