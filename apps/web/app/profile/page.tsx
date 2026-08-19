import { listProfiles, resolveProfile } from "@job-bot/database";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { singleParam, withProfile, type SearchParams } from "@/lib/active-profile";
import Link from "next/link";
import { exportProfileToFiles } from "./actions";
import { BulletList, Card, Chip, DefinitionList, EmptyState } from "@/components/ui";
import { formatDate, humanizeEnum } from "@/lib/format";

export const dynamic = "force-dynamic";

const formatSalaryExpectation = (profile: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: string;
}): string => {
  if (profile.salaryMin === null && profile.salaryMax === null) return "Not set";

  const format = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: profile.salaryCurrency,
      maximumFractionDigits: 0,
      notation: "compact",
    }).format(value);

  const range =
    profile.salaryMin !== null && profile.salaryMax !== null
      ? `${format(profile.salaryMin)} – ${format(profile.salaryMax)}`
      : format((profile.salaryMin ?? profile.salaryMax) as number);

  return `${range} per ${profile.salaryPeriod.toLowerCase()}`;
};

const ProfilePage = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const params = await searchParams;
  const [profiles, profile] = await Promise.all([
    listProfiles(),
    resolveProfile(singleParam(params.profile) || null),
  ]);

  if (!profile) {
    return (
      <EmptyState
        title="No profile seeded"
        hint="Add a directory under data/profiles/, then run pnpm db:seed."
      />
    );
  }

  const exported = singleParam(params.exported) || null;

  const skillsByCategory = profile.skills.reduce<Record<string, typeof profile.skills>>(
    (grouped, skill) => {
      const bucket = grouped[skill.category] ?? [];
      bucket.push(skill);
      grouped[skill.category] = bucket;
      return grouped;
    },
    {},
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{profile.fullName}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {profile.headline} · {profile.location}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={exportProfileToFiles}>
            <input type="hidden" name="slug" value={profile.slug} />
            <button
              type="submit"
              className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
            >
              Export to files
            </button>
          </form>
          <Link
            href={withProfile("/profile/edit", profile.slug)}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
          >
            Edit profile
          </Link>
        </div>
      </div>

      <ProfileSwitcher profiles={profiles} activeSlug={profile.slug} basePath="/profile" />

      {exported === null ? null : (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Wrote {exported} files to <code>data/profiles/{profile.slug}/</code>.
        </div>
      )}

      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-ink-muted)]">
        Edit everything here in the dashboard. <strong>Export to files</strong> writes it back to{" "}
        <code>data/profiles/{profile.slug}/</code> so the JSON stays a diffable copy. The agent may
        only assert what is recorded on this page.
      </div>

      <Card title="Preferences">
        <DefinitionList
          items={[
            ["Years of experience", `${profile.yearsOfExperience}`],
            ["Remote preference", humanizeEnum(profile.remotePreference)],
            ["Salary expectation", formatSalaryExpectation(profile)],
            ["Employment types", profile.employmentTypes.map(humanizeEnum).join(", ")],
            ["Preferred locations", profile.preferredLocations.join(", ") || "Any"],
            ["Industries", profile.industries.join(", ") || "Any"],
            [
              "Work authorization",
              <span key="wa">
                {profile.workAuthCountry} · {humanizeEnum(profile.workAuthStatus)}
                {profile.requiresSponsorship ? " · requires sponsorship" : ""}
                {profile.workAuthNotes ? (
                  <span className="mt-1 block text-xs text-[var(--color-ink-muted)]">
                    {profile.workAuthNotes}
                  </span>
                ) : null}
              </span>,
            ],
            ["Excluded companies", profile.excludedCompanies.join(", ") || "None"],
            ["Excluded technologies", profile.excludedTechnologies.join(", ") || "None"],
          ]}
        />
      </Card>

      <Card title="Target roles">
        <div className="flex flex-wrap gap-1.5">
          {profile.targetRoles.map((role) => (
            <Chip key={role}>{role}</Chip>
          ))}
        </div>
      </Card>

      <Card title="Skills">
        <div className="space-y-4">
          {Object.entries(skillsByCategory).map(([category, skills]) => (
            <div key={category}>
              <h3 className="mb-2 text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                {category}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <Chip key={skill.id}>
                    {skill.name} · {humanizeEnum(skill.level)}
                    {skill.yearsUsed !== null ? ` · ${skill.yearsUsed}y` : ""}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {profile.education.length > 0 ? (
        <Card title="Education & certifications">
          <div className="space-y-3">
            {profile.education.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm text-[var(--color-ink)]">{entry.program}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {entry.institution} · {humanizeEnum(entry.kind)}
                  </p>
                </div>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {formatDate(entry.startDate)} – {formatDate(entry.endDate)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card
        title="Experience"
        action={
          <Link
            href={withProfile("/profile/experience/new", profile.slug)}
            className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
          >
            + Add experience
          </Link>
        }
      >
        <div className="space-y-8">
          {profile.experiences.map((experience) => (
            <article key={experience.id} className="space-y-3">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-medium text-[var(--color-ink)]">
                  {experience.role} · {experience.company}
                  <Link
                    href={withProfile(`/profile/experience/${experience.slug}`, profile.slug)}
                    className="ml-3 text-xs font-normal text-sky-300 hover:text-sky-200"
                  >
                    Edit
                  </Link>
                </h3>
                <p className="w-full text-xs text-[var(--color-ink-muted)]">
                  {formatDate(experience.startDate)} –{" "}
                  {experience.isCurrent ? "present" : formatDate(experience.endDate)} ·{" "}
                  {experience.location} · {humanizeEnum(experience.employmentType)}
                </p>
              </header>

              <p className="text-sm text-[var(--color-ink)]">{experience.description}</p>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Responsibilities
                  </h4>
                  <BulletList items={experience.responsibilities} empty="None recorded." />
                </div>
                <div>
                  <h4 className="mb-2 text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Achievements
                  </h4>
                  <BulletList items={experience.achievements} empty="None recorded." />
                </div>
              </div>

              {experience.projects.length > 0 ? (
                <div>
                  <h4 className="mb-2 text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Projects
                  </h4>
                  <div className="space-y-3">
                    {experience.projects.map((project) => (
                      <div
                        key={project.id}
                        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-3"
                      >
                        <p className="text-sm font-medium text-[var(--color-ink)]">{project.name}</p>
                        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{project.description}</p>
                        {project.impact ? (
                          <p className="mt-1 text-xs text-emerald-300">{project.impact}</p>
                        ) : null}
                        {project.technologies.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {project.technologies.map((technology) => (
                              <Chip key={technology}>{technology}</Chip>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {experience.technologies.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {experience.technologies.map((technology) => (
                    <Chip key={technology}>{technology}</Chip>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default ProfilePage;
