import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, resolveProfile } from "@job-bot/database";
import { EMPLOYMENT_TYPES } from "@job-bot/shared";
import { Card } from "@/components/ui";
import {
  Field,
  FormError,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
  Toggle,
} from "@/components/form-fields";
import { csvToText, linesToText } from "@/lib/form-parse";
import { humanizeEnum } from "@/lib/format";
import { singleParam, withProfile, type SearchParams } from "@/lib/active-profile";
import { removeExperience, updateExperience } from "../../actions";

export const dynamic = "force-dynamic";

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * One route serves both creating and editing: `/profile/experience/new` for a
 * new role, `/profile/experience/<slug>` for an existing one.
 */
const ExperiencePage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) => {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const profile = await resolveProfile(singleParam(search.profile) || null);
  if (!profile) notFound();

  const isNew = slug === "new";
  const experience = isNew
    ? null
    : await prisma.experience.findUnique({
        where: { slug },
        include: { projects: { orderBy: { name: "asc" } } },
      });

  if (!isNew && !experience) notFound();

  const projectLines = (experience?.projects ?? [])
    .map((project) =>
      [
        project.name,
        project.description,
        project.technologies.join(", "),
        project.impact ?? "",
        project.url ?? "",
      ].join(" | "),
    )
    .join("\n");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isNew ? "Add experience" : `${experience?.role} — ${experience?.company}`}
        </h1>
        <Link
          href={withProfile("/profile", profile.slug)}
          className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          ← Back to profile
        </Link>
      </div>

      <FormError message={singleParam(search.error) || null} />

      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-ink-muted)]">
        Everything here is quotable. Resume bullets must cite recorded text verbatim, so write
        responsibilities and achievements as you would want them to appear — the agent rewrites
        them for emphasis, but it cannot add anything that is not here.
      </div>

      <form action={updateExperience} className="space-y-6">
        <input type="hidden" name="profileSlug" value={profile.slug} />
        {experience ? <input type="hidden" name="experienceSlug" value={experience.slug} /> : null}

        <Card title="The role">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company">
              <TextInput name="company" defaultValue={experience?.company} required />
            </Field>
            <Field label="Role">
              <TextInput name="role" defaultValue={experience?.role} required />
            </Field>
            <Field label="Employment type">
              <Select
                name="employmentType"
                options={EMPLOYMENT_TYPES}
                defaultValue={experience?.employmentType ?? "FULL_TIME"}
                labelFor={humanizeEnum}
              />
            </Field>
            <Field label="Location">
              <TextInput name="location" defaultValue={experience?.location} required />
            </Field>
            <Field label="Start date" hint="YYYY-MM-DD">
              <TextInput
                name="startDate"
                type="date"
                defaultValue={experience ? isoDate(experience.startDate) : ""}
                required
              />
            </Field>
            <Field label="End date" hint="Leave blank if this is your current role.">
              <TextInput
                name="endDate"
                type="date"
                defaultValue={experience?.endDate ? isoDate(experience.endDate) : ""}
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-6">
            <Toggle name="isRemote" label="Remote" defaultChecked={experience?.isRemote ?? false} />
            <Toggle
              name="isCurrent"
              label="This is my current role"
              defaultChecked={experience?.isCurrent ?? false}
            />
          </div>

          <div className="mt-4">
            <Field label="Description" hint="One or two sentences on what the role was.">
              <TextArea name="description" rows={3} defaultValue={experience?.description} required />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Technologies" hint="Comma separated. These drive the technical match.">
              <TextInput name="technologies" defaultValue={csvToText(experience?.technologies ?? [])} />
            </Field>
          </div>
        </Card>

        <Card title="What you did">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Responsibilities" hint="One per line.">
              <TextArea
                name="responsibilities"
                rows={7}
                defaultValue={linesToText(experience?.responsibilities ?? [])}
              />
            </Field>
            <Field label="Achievements" hint="One per line. Outcomes, ideally with numbers.">
              <TextArea
                name="achievements"
                rows={7}
                defaultValue={linesToText(experience?.achievements ?? [])}
              />
            </Field>
          </div>
        </Card>

        <Card title="Projects">
          <Field
            label="One per line"
            hint="Name | Description | Technologies (comma separated) | Impact | URL. Impact and URL may be blank."
          >
            <TextArea
              name="projects"
              rows={6}
              defaultValue={projectLines}
              placeholder="LiveDocs | Collaborative document editor with realtime presence | Next.js, Liveblocks, TypeScript | | https://github.com/you/livedocs"
            />
          </Field>
        </Card>

        <SubmitButton>{isNew ? "Add experience" : "Save experience"}</SubmitButton>
      </form>

      {experience ? (
        <form action={removeExperience}>
          <input type="hidden" name="profileSlug" value={profile.slug} />
          <input type="hidden" name="experienceId" value={experience.id} />
          <button
            type="submit"
            className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-ink-muted)] transition hover:border-rose-500/50 hover:text-rose-300"
          >
            Delete this experience
          </button>
        </form>
      ) : null}
    </div>
  );
};

export default ExperiencePage;
