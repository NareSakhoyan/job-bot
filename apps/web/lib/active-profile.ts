import { redirect } from "next/navigation";
import { listProfiles, resolveProfile, type ProfileSummary } from "@job-bot/database";

export type SearchParams = Record<string, string | string[] | undefined>;

export const singleParam = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export interface ActiveProfileContext {
  profiles: ProfileSummary[];
  active: ProfileSummary;
}

/**
 * Resolves which CV the page is being viewed as. The slug lives in the URL, so
 * every view is linkable and the choice survives a reload; an unknown slug
 * falls back to the first profile rather than erroring.
 */
export const getActiveProfile = async (params: SearchParams): Promise<ActiveProfileContext> => {
  const requested = singleParam(params.profile);
  const [profiles, resolved] = await Promise.all([listProfiles(), resolveProfile(requested || null)]);

  if (!resolved) redirect("/setup");

  const active = profiles.find((profile) => profile.id === resolved.id) ?? {
    id: resolved.id,
    slug: resolved.slug,
    fullName: resolved.fullName,
    headline: resolved.headline,
  };

  return { profiles, active };
};

/** Preserves the active profile across links. */
export const withProfile = (href: string, slug: string): string => {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}profile=${encodeURIComponent(slug)}`;
};
