import Link from "next/link";
import { notFound } from "next/navigation";
import { getJobById } from "@job-bot/database";
import { getActiveProfile, withProfile, type SearchParams } from "@/lib/active-profile";
import { StatusBadge } from "@/components/badges";
import { StatusControl } from "@/components/status-control";
import { MatchPanel } from "@/components/match-panel";
import { BulletList, Card, Chip, DefinitionList, EmptyState } from "@/components/ui";
import { formatDate, formatSalary, humanizeEnum } from "@/lib/format";

export const dynamic = "force-dynamic";

const JobDetailPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) => {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const { active } = await getActiveProfile(search);
  const job = await getJobById(id, active.id);

  if (!job) notFound();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={withProfile("/jobs", active.slug)} className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
          ← Back to jobs
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <StatusBadge status={job.application?.status ?? null} />
        </div>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {job.company} · {job.location}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <MatchPanel match={job.match} />

          <Card title="Extracted requirements">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Requirements
                </h3>
                <BulletList items={job.requirements} empty="None extracted." />
              </div>
              <div>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Responsibilities
                </h3>
                <BulletList items={job.responsibilities} empty="None extracted." />
              </div>
            </div>
            {job.technologies.length > 0 ? (
              <div className="mt-5">
                <h3 className="mb-2 text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Technologies
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {job.technologies.map((technology) => (
                    <Chip key={technology}>{technology}</Chip>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          <Card title="Original description">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--color-ink)]">
              {job.description}
            </pre>
          </Card>

          <Card title="Generated materials">
            <EmptyState
              title="Nothing generated yet"
              hint="Tailored resumes, cover letters and application answers are produced from the profile's recorded experience."
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <DefinitionList
              items={[
                ["Company", job.company],
                ["Location", job.isRemote ? `${job.location} (remote)` : job.location],
                ["Salary", formatSalary(job)],
                ["Employment type", humanizeEnum(job.employmentType)],
                ["Posted", formatDate(job.postedAt)],
                ["Discovered", formatDate(job.discoveredAt)],
                [
                  "Original posting",
                  <a
                    key="url"
                    href={job.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-medium text-sky-300 hover:text-sky-200"
                  >
                    Open the announcement ↗
                  </a>,
                ],
              ]}
            />
          </Card>

          <Card title={`Sources (${job.sightings.length})`}>
            <ul className="space-y-2">
              {job.sightings.map((sighting) => (
                <li key={sighting.id} className="text-sm">
                  {/* Each sighting is a real posting on a real board, so it
                      links to that board's copy rather than just naming it. */}
                  <a
                    href={sighting.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sky-300 hover:text-sky-200"
                  >
                    {sighting.source} ↗
                  </a>
                  <span className="text-[var(--color-ink-muted)]"> · {sighting.externalId}</span>
                </li>
              ))}
            </ul>
            {job.sightings.length > 1 ? (
              <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
                These sightings were deduplicated into a single job.
              </p>
            ) : null}
          </Card>

          <Card title="Application">
            {job.application ? (
              <div className="space-y-4">
                <DefinitionList
                  items={[
                    ["Status", <StatusBadge key="s" status={job.application.status} />],
                    ["Submission", humanizeEnum(job.application.submissionStatus)],
                  ]}
                />
                <div>
                  <h3 className="mb-2 text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                    History
                  </h3>
                  <ul className="space-y-2">
                    {job.application.events.map((event) => (
                      <li key={event.id} className="text-xs text-[var(--color-ink-muted)]">
                        <span className="text-[var(--color-ink)]">{formatDate(event.createdAt)}</span> ·{" "}
                        {event.actor} · {event.message}
                      </li>
                    ))}
                  </ul>
                </div>
                <StatusControl
                  jobId={job.id}
                  profileId={active.id}
                  application={{ id: job.application.id, submittedAt: job.application.submittedAt }}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-[var(--color-ink-muted)]">Not in the pipeline.</p>
                <StatusControl jobId={job.id} profileId={active.id} application={null} />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default JobDetailPage;
