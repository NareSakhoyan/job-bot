import Link from "next/link";
import { listApplicationsForReview } from "@job-bot/database";
import {
  applicationAnswersSchema,
  tailoredResumeSchema,
  type ApplicationAnswer,
} from "@job-bot/shared";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { ScoreBadge } from "@/components/badges";
import { BulletList, Card, Chip, DefinitionList, EmptyState } from "@/components/ui";
import { formatSalary, humanizeEnum } from "@/lib/format";
import { getActiveProfile, singleParam, withProfile, type SearchParams } from "@/lib/active-profile";
import { decideApplication } from "./actions";
import { saveApplicationEdits } from "./edit-actions";

export const dynamic = "force-dynamic";

const STRENGTH_TONE: Record<ApplicationAnswer["strength"], string> = {
  STRONG: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  LIMITED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  ADJACENT: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  NONE: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

const ReviewPage = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const params = await searchParams;
  const { profiles, active } = await getActiveProfile(params);
  const applications = await listApplicationsForReview(active.id);
  const edited = singleParam(params.edited) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Ready to apply</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">{applications.length} awaiting review</p>
      </div>

      <ProfileSwitcher profiles={profiles} activeSlug={active.slug} basePath="/review" />

      {edited === null ? null : (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {edited === "0" ? "Reviewed with no changes." : `Saved ${edited} edit(s).`}
        </div>
      )}

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
        Approving records your decision and marks the application ready. It does not send anything —
        this system has no code path that submits an application.
      </div>

      {applications.length === 0 ? (
        <EmptyState
          title="Nothing awaiting review"
          hint="Run pnpm prepare to generate material for this profile's shortlisted jobs."
        />
      ) : (
        applications.map((application) => {
          const match = application.job.matches[0] ?? null;
          const resume = tailoredResumeSchema.safeParse(application.tailoredResume);
          const answers = applicationAnswersSchema.safeParse(application.answers);

          return (
            <Card key={application.id} title={`${application.job.company} — ${application.job.title}`}>
              <div className="space-y-6">
                <DefinitionList
                  items={[
                    ["Company", application.job.company],
                    ["Role", application.job.title],
                    ["Match score", <ScoreBadge key="s" score={match?.score ?? null} />],
                    ["Salary", formatSalary(application.job)],
                    [
                      "Location",
                      application.job.isRemote
                        ? `${application.job.location} (remote)`
                        : application.job.location,
                    ],
                    [
                      "Original posting",
                      <a
                        key="posting"
                        href={application.job.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-medium text-sky-300 hover:text-sky-200"
                      >
                        Open the announcement ↗
                      </a>,
                    ],
                    [
                      "Job details",
                      <Link
                        key="l"
                        href={withProfile(`/jobs/${application.jobId}`, active.slug)}
                        className="text-sky-300 hover:text-sky-200"
                      >
                        Open →
                      </Link>,
                    ],
                  ]}
                />

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-300">
                      Why this matches
                    </h3>
                    <p className="mb-2 text-sm text-[var(--color-ink)]">{match?.reasoning ?? "—"}</p>
                    <BulletList items={match?.matchingSkills ?? []} empty="No matching skills recorded." />
                  </div>
                  <div>
                    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-rose-300">
                      Potential concerns
                    </h3>
                    <BulletList items={match?.concerns ?? []} empty="None recorded." />
                  </div>
                </div>

                {application.notes ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
                    <pre className="whitespace-pre-wrap font-sans">{application.notes}</pre>
                  </div>
                ) : null}

                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Generated answers
                  </h3>
                  {answers.success && answers.data.length > 0 ? (
                    <div className="space-y-3">
                      {answers.data.map((answer, index) => (
                        <div
                          key={answer.question}
                          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-3"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-sm font-medium text-[var(--color-ink)]">
                              {answer.question}
                            </p>
                            <span
                              className={`rounded-md border px-2 py-0.5 text-xs ${STRENGTH_TONE[answer.strength]}`}
                            >
                              {humanizeEnum(answer.strength)}
                            </span>
                          </div>
                          {/* Editable in place. The strength badge above is not:
                              it describes what the profile supports, and
                              rewording a sentence does not change that. */}
                          <textarea
                            form={`edit-${application.id}`}
                            name={`answer-${index}`}
                            rows={4}
                            defaultValue={answer.answer}
                            className="mt-2 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-sky-500/60"
                          />
                          {answer.missingInformation.length > 0 ? (
                            <p className="mt-2 text-xs text-amber-300">
                              Missing: {answer.missingInformation.join("; ")}
                            </p>
                          ) : null}
                          {answer.requiresHumanInput ? (
                            <p className="mt-1 text-xs text-amber-300">Needs your input before sending.</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-ink-muted)]">No answers generated.</p>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Cover letter
                  </h3>
                  <textarea
                    form={`edit-${application.id}`}
                    name="coverLetter"
                    rows={12}
                    defaultValue={application.coverLetter ?? ""}
                    placeholder="No cover letter passed verification. You can write one here."
                    className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] px-4 py-3 text-sm leading-relaxed text-[var(--color-ink)] outline-none focus:border-sky-500/60"
                  />
                </div>

                {/* Declared outside the decision form: HTML forms cannot nest,
                    so the fields above attach to it by id. */}
                <form action={saveApplicationEdits} id={`edit-${application.id}`} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <input type="hidden" name="profileSlug" value={active.slug} />
                  <input type="hidden" name="notes" value={application.notes ?? ""} />
                  <button
                    type="submit"
                    className="rounded-md border border-sky-500/50 px-4 py-2 text-sm text-sky-200 transition hover:bg-sky-500/10"
                  >
                    Save edits
                  </button>
                  <span className="text-xs text-[var(--color-ink-muted)]">
                    Saving edits records the change and leaves the application awaiting your decision.
                  </span>
                </form>

                <div>
                  <h3 className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Tailored resume
                    {resume.success && resume.data.missingInformation.length > 0 ? (
                      <Chip tone="warn">
                        {resume.data.missingInformation.length} gap
                        {resume.data.missingInformation.length === 1 ? "" : "s"} flagged
                      </Chip>
                    ) : null}
                  </h3>
                  {resume.success ? (
                    <>
                      <pre className="whitespace-pre-wrap rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-4 font-sans text-sm leading-relaxed">
                        {resume.data.markdown}
                      </pre>
                      {resume.data.missingInformation.length > 0 ? (
                        <div className="mt-3">
                          <p className="mb-1 text-xs uppercase tracking-wide text-amber-300">
                            Asked for but not recorded in the profile
                          </p>
                          <BulletList items={resume.data.missingInformation} empty="" />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-[var(--color-ink-muted)]">No verified resume stored.</p>
                  )}
                </div>

                <form action={decideApplication} className="space-y-3 border-t border-[var(--color-line)] pt-5">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                      Note (optional)
                    </span>
                    <textarea
                      name="note"
                      rows={2}
                      placeholder="Anything to record with this decision"
                      className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-sky-500/60"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      name="decision"
                      value="REJECTED"
                      className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-ink-muted)] transition hover:border-rose-500/50 hover:text-rose-300"
                    >
                      Reject
                    </button>
                    <Link
                      href={withProfile("/profile/edit", active.slug)}
                      className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
                    >
                      Edit profile
                    </Link>
                    <button
                      type="submit"
                      name="decision"
                      value="APPROVED"
                      className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
                    >
                      Approve &amp; queue for submission
                    </button>
                  </div>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    Approving records who approved it and when — the only thing that makes this
                    application eligible to be sent. Nothing is sent from this page: an approved
                    application appears under &ldquo;Needs you&rdquo; on the Applications page,
                    where filling the form opens a browser for you to finish. Fully automatic
                    clicking stays a typed command: <code>pnpm submit --mode auto --confirm</code>.
                  </p>
                </form>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default ReviewPage;
