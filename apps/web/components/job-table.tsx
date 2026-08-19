import Link from "next/link";
import type { JobListItem } from "@job-bot/database";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { formatRelativeDays, formatSalary } from "@/lib/format";
import { EmptyState } from "@/components/ui";
import { withProfile } from "@/lib/active-profile";

const headerClass = "px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]";
const cellClass = "px-4 py-3 align-top text-sm";

export const JobTable = ({
  jobs,
  profileSlug,
}: {
  jobs: JobListItem[];
  profileSlug: string;
}) => {
  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No jobs match these filters"
        hint="Clear the filters, or run pnpm discover then pnpm match for this profile."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="border-b border-[var(--color-line)]">
          <tr>
            <th className={headerClass}>Score</th>
            <th className={headerClass}>Company</th>
            <th className={headerClass}>Role</th>
            <th className={headerClass}>Location</th>
            <th className={headerClass}>Salary</th>
            <th className={headerClass}>Status</th>
            <th className={headerClass}>Discovered</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr
              key={job.id}
              className="border-b border-[var(--color-line)]/60 transition hover:bg-[var(--color-surface-raised)]"
            >
              <td className={cellClass}>
                <ScoreBadge score={job.match?.score ?? null} />
              </td>
              <td className={`${cellClass} text-[var(--color-ink)]`}>
                {job.company}
                {job.sightings.length > 1 ? (
                  <span
                    className="ml-2 text-xs text-[var(--color-ink-muted)]"
                    title={`Seen on ${job.sightings.length} sources`}
                  >
                    ×{job.sightings.length}
                  </span>
                ) : null}
              </td>
              <td className={cellClass}>
                <div className="flex items-baseline gap-2">
                  <Link
                    href={withProfile(`/jobs/${job.id}`, profileSlug)}
                    className="font-medium text-sky-300 hover:text-sky-200"
                  >
                    {job.title}
                  </Link>
                  {/* Straight to the board's posting, skipping the detail page. */}
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    title="Open the original announcement"
                    className="shrink-0 text-xs text-[var(--color-ink-muted)] transition hover:text-sky-300"
                  >
                    ↗
                  </a>
                </div>
              </td>
              <td className={`${cellClass} text-[var(--color-ink-muted)]`}>{job.location}</td>
              <td className={`${cellClass} text-[var(--color-ink-muted)] whitespace-nowrap`}>
                {formatSalary(job)}
              </td>
              <td className={cellClass}>
                <StatusBadge status={job.application?.status ?? null} />
              </td>
              <td className={`${cellClass} text-[var(--color-ink-muted)] whitespace-nowrap`}>
                {formatRelativeDays(job.discoveredAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
