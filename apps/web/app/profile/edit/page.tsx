import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveProfile } from "@job-bot/database";
import {
  EDUCATION_KINDS,
  EMPLOYMENT_TYPES,
  REMOTE_PREFERENCES,
  SALARY_PERIODS,
  SKILL_LEVELS,
  WORK_AUTHORIZATION_STATUSES,
} from "@job-bot/shared";
import { Card } from "@/components/ui";
import {
  CheckboxRow,
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
import { updateEducation, updateProfile } from "../actions";

export const dynamic = "force-dynamic";

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const EditProfilePage = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const params = await searchParams;
  const profile = await resolveProfile(singleParam(params.profile) || null);
  if (!profile) notFound();

  const error = singleParam(params.error) || null;
  const saved = singleParam(params.saved) === "1";

  const skillLines = profile.skills
    .map((skill) => `${skill.name} | ${skill.category} | ${skill.level} | ${skill.yearsUsed ?? ""}`)
    .join("\n");

  const educationLines = profile.education
    .map((entry) =>
      [
        entry.institution,
        entry.program,
        entry.kind,
        isoDate(entry.startDate),
        entry.endDate === null ? "" : isoDate(entry.endDate),
      ].join(" | "),
    )
    .join("\n");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Edit {profile.fullName}</h1>
        <Link
          href={withProfile("/profile", profile.slug)}
          className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          ← Back to profile
        </Link>
      </div>

      <FormError message={error} />
      {saved && error === null ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Saved. Everything the agent asserts comes from what is stored here.
        </div>
      ) : null}

      <form action={updateProfile} className="space-y-6">
        <input type="hidden" name="slug" value={profile.slug} />

        <Card title="Identity">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Full name">
              <TextInput name="fullName" defaultValue={profile.fullName} required />
            </Field>
            <Field label="Headline">
              <TextInput name="headline" defaultValue={profile.headline} required />
            </Field>
            <Field label="Email">
              <TextInput name="email" type="email" defaultValue={profile.email} required />
            </Field>
            <Field label="Phone">
              <TextInput name="phone" defaultValue={profile.phone} />
            </Field>
            <Field label="Location">
              <TextInput name="location" defaultValue={profile.location} required />
            </Field>
            <Field label="Years of experience" hint="What you tell people, not a calculation.">
              <TextInput
                name="yearsOfExperience"
                type="number"
                step="0.5"
                defaultValue={String(profile.yearsOfExperience)}
                required
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Summary">
              <TextArea name="summary" rows={4} defaultValue={profile.summary} required />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label="GitHub URL">
              <TextInput name="githubUrl" defaultValue={profile.githubUrl} placeholder="https://github.com/…" />
            </Field>
            <Field label="LinkedIn URL">
              <TextInput name="linkedinUrl" defaultValue={profile.linkedinUrl} />
            </Field>
            <Field label="Website URL">
              <TextInput name="websiteUrl" defaultValue={profile.websiteUrl} />
            </Field>
          </div>
        </Card>

        <Card title="What you are looking for">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Target roles" hint="One per line. These drive both search and role scoring.">
              <TextArea name="targetRoles" rows={6} defaultValue={linesToText(profile.targetRoles)} />
            </Field>
            <Field label="Preferred locations" hint="One per line. Include Remote if it applies.">
              <TextArea
                name="preferredLocations"
                rows={6}
                defaultValue={linesToText(profile.preferredLocations)}
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Remote preference">
              <Select
                name="remotePreference"
                options={REMOTE_PREFERENCES}
                defaultValue={profile.remotePreference}
                labelFor={humanizeEnum}
              />
            </Field>
            <Field label="Employment types">
              <CheckboxRow
                name="employmentTypes"
                options={EMPLOYMENT_TYPES}
                selected={profile.employmentTypes}
                labelFor={humanizeEnum}
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <Field label="Salary min" hint="Leave blank to skip salary scoring.">
              <TextInput
                name="salaryMin"
                type="number"
                defaultValue={profile.salaryMin === null ? "" : String(profile.salaryMin)}
              />
            </Field>
            <Field label="Salary max">
              <TextInput
                name="salaryMax"
                type="number"
                defaultValue={profile.salaryMax === null ? "" : String(profile.salaryMax)}
              />
            </Field>
            <Field label="Currency">
              <TextInput name="salaryCurrency" defaultValue={profile.salaryCurrency} />
            </Field>
            <Field label="Period">
              <Select name="salaryPeriod" options={SALARY_PERIODS} defaultValue={profile.salaryPeriod} />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label="Industries" hint="One per line. Blank means any.">
              <TextArea name="industries" rows={4} defaultValue={linesToText(profile.industries)} />
            </Field>
            <Field label="Excluded companies" hint="One per line. Caps any match to 15.">
              <TextArea
                name="excludedCompanies"
                rows={4}
                defaultValue={linesToText(profile.excludedCompanies)}
              />
            </Field>
            <Field label="Excluded technologies" hint="One per line.">
              <TextArea
                name="excludedTechnologies"
                rows={4}
                defaultValue={linesToText(profile.excludedTechnologies)}
              />
            </Field>
          </div>
        </Card>

        <Card title="Work authorization">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Country">
              <TextInput name="workAuthCountry" defaultValue={profile.workAuthCountry} required />
            </Field>
            <Field label="Status">
              <Select
                name="workAuthStatus"
                options={WORK_AUTHORIZATION_STATUSES}
                defaultValue={profile.workAuthStatus}
                labelFor={humanizeEnum}
              />
            </Field>
            <div className="flex items-end pb-2">
              <Toggle
                name="requiresSponsorship"
                label="Requires visa sponsorship"
                defaultChecked={profile.requiresSponsorship}
              />
            </div>
          </div>
          <div className="mt-4">
            <Field
              label="Notes"
              hint="Read verbatim when a form asks about authorization. Say exactly what is and is not true."
            >
              <TextArea name="workAuthNotes" rows={3} defaultValue={profile.workAuthNotes} />
            </Field>
          </div>
        </Card>

        <Card title="Skills">
          <Field
            label="One per line"
            hint="Name | Category | Level | Years used. Level is one of: EXPERT, ADVANCED, INTERMEDIATE, BEGINNER. Years may be blank."
          >
            <TextArea name="skills" rows={12} defaultValue={skillLines} />
          </Field>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            Levels are load-bearing: {SKILL_LEVELS.join(", ")} weight the technical match differently.
          </p>
        </Card>

        <SubmitButton>Save profile</SubmitButton>
      </form>

      <form action={updateEducation} className="space-y-4">
        <input type="hidden" name="slug" value={profile.slug} />
        <Card title="Education and certifications">
          <Field
            label="One per line"
            hint={`Institution | Program | Kind | Start (YYYY-MM-DD) | End. Kind is one of: ${EDUCATION_KINDS.join(", ")}. End may be blank.`}
          >
            <TextArea name="education" rows={8} defaultValue={educationLines} />
          </Field>
          <div className="mt-4">
            <SubmitButton>Save education</SubmitButton>
          </div>
        </Card>
      </form>
    </div>
  );
};

export default EditProfilePage;
