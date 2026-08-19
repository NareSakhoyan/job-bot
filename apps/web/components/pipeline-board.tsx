import Link from "next/link";
import { APPLICATION_PIPELINE, TERMINAL_APPLICATION_STATUSES } from "@job-bot/shared";
import type { ApplicationListItem } from "@job-bot/database";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { humanizeEnum } from "@/lib/format";
import { withProfile } from "@/lib/active-profile";

const Column = ({
  title,
  applications,
  profileSlug,
}: {
  title: string;
  applications: ApplicationListItem[];
  profileSlug: string;
}) => (
  <div className="flex min-w-56 flex-1 flex-col rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
    <header className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
        {title}
      </span>
      <span className="text-xs tabular-nums text-[var(--color-ink-muted)]">{applications.length}</span>
    </header>
    <div className="flex flex-col gap-2 p-2">
      {applications.length === 0 ? (
        <p className="px-1 py-3 text-xs text-[var(--color-ink-muted)]">Empty</p>
      ) : (
        applications.map((application) => (
          <Link
            key={application.id}
            href={withProfile(`/jobs/${application.jobId}`, profileSlug)}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-3 transition hover:border-sky-500/50"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-[var(--color-ink)]">
                {application.job.company}
              </span>
              <ScoreBadge score={application.job.matches[0]?.score ?? null} />
            </div>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{application.job.title}</p>
          </Link>
        ))
      )}
    </div>
  </div>
);

export const PipelineBoard = ({
  applications,
  profileSlug,
}: {
  applications: ApplicationListItem[];
  profileSlug: string;
}) => {
  const closed = applications.filter((application) =>
    TERMINAL_APPLICATION_STATUSES.includes(application.status),
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {APPLICATION_PIPELINE.map((status) => (
          <Column
            key={status}
            title={humanizeEnum(status)}
            applications={applications.filter((application) => application.status === status)}
            profileSlug={profileSlug}
          />
        ))}
      </div>

      {closed.length > 0 ? (
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            Closed
          </h2>
          <div className="flex flex-wrap gap-2">
            {closed.map((application) => (
              <Link
                key={application.id}
                href={withProfile(`/jobs/${application.jobId}`, profileSlug)}
                className="flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm transition hover:border-sky-500/50"
              >
                <span>{application.job.company}</span>
                <StatusBadge status={application.status} />
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
