import { recordExternalApplication } from "@/app/applications/actions";
import { Card } from "@/components/ui";

const field =
  "rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-sky-500/60";

/**
 * Records an application to something the catalogue never held.
 *
 * Most of a real search happens outside a job board: referrals, LinkedIn,
 * agencies, companies on no ATS this tool speaks. Without this the outcome
 * loop only ever sees applications the pipeline found for itself, which is
 * the least representative sample of the search available.
 */
export const ExternalApplication = ({ profileId }: { profileId: string }) => (
  <Card title="Applied somewhere else?">
    <form action={recordExternalApplication} className="space-y-3">
      <input type="hidden" name="profileId" value={profileId} />
      <div className="flex flex-wrap gap-2">
        <input name="company" placeholder="Company" required className={`${field} min-w-[10rem] flex-1`} />
        <input name="title" placeholder="Role title" required className={`${field} min-w-[12rem] flex-[2]`} />
        <input name="url" placeholder="Posting URL (optional)" className={`${field} min-w-[12rem] flex-[2]`} />
      </div>
      <input name="note" placeholder="Where you found it, when you applied (optional)" className={`${field} w-full`} />
      <button
        type="submit"
        className="rounded-md border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-ink-muted)] transition hover:border-emerald-500/50 hover:text-emerald-300"
      >
        Record this application
      </button>
      <p className="text-xs text-[var(--color-ink-muted)]">
        Creates the job and marks it sent, so it can be followed up and its outcome recorded.
        The pipeline will never apply to it.
      </p>
    </form>
  </Card>
);
