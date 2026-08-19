import Link from "next/link";
import type { ProfileSummary } from "@job-bot/database";

/**
 * Switches which CV the dashboard is viewed as. Rendered as links rather than
 * a form so it works without client JavaScript and every profile view is a
 * shareable URL.
 */
export const ProfileSwitcher = ({
  profiles,
  activeSlug,
  basePath,
}: {
  profiles: ProfileSummary[];
  activeSlug: string;
  basePath: string;
}) => {
  if (profiles.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Viewing as</span>
      {profiles.map((profile) => {
        const isActive = profile.slug === activeSlug;
        return (
          <Link
            key={profile.id}
            href={`${basePath}?profile=${encodeURIComponent(profile.slug)}`}
            className={`rounded-md border px-3 py-1.5 text-sm transition ${
              isActive
                ? "border-sky-500/60 bg-sky-500/10 text-sky-200"
                : "border-[var(--color-line)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            {profile.fullName}
            <span className="ml-2 text-xs opacity-70">{profile.headline}</span>
          </Link>
        );
      })}
    </div>
  );
};
