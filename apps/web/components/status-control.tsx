import { markAppliedByHand, setApplicationStatus } from "@/app/applications/actions";
import { SETTABLE_STATUSES } from "@/lib/settable-statuses";

const field =
  "rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-sky-500/60";
const button =
  "rounded-md border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]";

/**
 * Lets a person correct the record from the page they are reading.
 *
 * Two separate things, because they are not the same claim. Setting a status
 * is bookkeeping and reversible. Recording that an application was actually
 * sent stamps `submittedAt`, which is what stops the pipeline ever sending a
 * second one — so it is a one-way door, and it says so.
 */
export const StatusControl = ({
  jobId,
  profileId,
  application,
}: {
  jobId: string;
  profileId: string;
  application: { id: string; submittedAt: Date | null } | null;
}) => {
  const alreadySent = application?.submittedAt != null;

  return (
    <div className="space-y-4 border-t border-[var(--color-line)] pt-4">
      {application ? (
        <form action={setApplicationStatus} className="space-y-2">
          <input type="hidden" name="applicationId" value={application.id} />
          <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Set status</p>
          <div className="flex flex-wrap gap-2">
            <select name="status" className={field} defaultValue="SHORTLISTED">
              {SETTABLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
            <input name="note" placeholder="why (optional)" className={`${field} min-w-[12rem] flex-1`} />
            <button type="submit" className={button}>
              Set
            </button>
          </div>
        </form>
      ) : null}

      {alreadySent ? (
        <p className="text-xs text-[var(--color-ink-muted)]">
          Recorded as sent. It cannot be sent again, and that is deliberate — the record of a
          click is what prevents a duplicate application.
        </p>
      ) : (
        <form action={markAppliedByHand} className="space-y-2">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="profileId" value={profileId} />
          <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
            Applied outside this tool?
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              name="note"
              placeholder="where and when, if you want it on the record"
              className={`${field} min-w-[14rem] flex-1`}
            />
            <button type="submit" className={`${button} hover:border-emerald-500/50 hover:text-emerald-300`}>
              I applied to this myself
            </button>
          </div>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Marks it sent so the pipeline never applies again. This cannot be undone.
          </p>
        </form>
      )}
    </div>
  );
};
