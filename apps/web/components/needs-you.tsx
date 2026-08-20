import { OUTCOME_RESULTS, OUTCOME_STAGES } from "@job-bot/shared";
import { markSentByHand, recordOutcomeAction, releaseHandoffAction } from "@/app/applications/actions";
import { startSubmission } from "@/app/pipeline/actions";
import { Card, Chip } from "@/components/ui";

/** The subset of an application this panel needs; kept structural so the page
 *  can pass rows from `listApplications` without a bespoke query. */
export interface AttentionApplication {
  id: string;
  status: string;
  submissionStatus: string;
  submittedAt: Date | null;
  job: { company: string; title: string; url: string };
  outcome: { result: string; stage: string } | null;
}

const field =
  "w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-sky-500/60";
const button =
  "rounded-md border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]";

const Heading = ({ application }: { application: AttentionApplication }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-2">
    <a
      href={application.job.url}
      target="_blank"
      rel="noreferrer"
      className="text-sm font-medium text-[var(--color-ink)] hover:underline"
    >
      {application.job.company} — {application.job.title}
    </a>
    <Chip tone="warn">{application.submissionStatus.replace(/_/g, " ").toLowerCase()}</Chip>
  </div>
);

/**
 * The decisions that only a person can make, in the place they are looking.
 *
 * Each of these was previously a terminal command. They are not conveniences:
 * a handed-off application that a person submitted by hand is invisible to the
 * system until someone says so, and until then it can be released back into
 * the queue and sent a second time.
 */
export const NeedsYou = ({
  applications,
  canLaunchRuns,
}: {
  applications: AttentionApplication[];
  /** Filling a form drives a local browser; serverless deployments hide the button. */
  canLaunchRuns: boolean;
}) => {
  const handedOff = applications.filter((a) => a.submissionStatus === "HANDED_OFF" && a.submittedAt === null);
  const awaitingOutcome = applications.filter((a) => a.submittedAt !== null && a.outcome === null);
  // Mirrors listApprovedForSubmission: approved, unsent, and not already in a
  // run's hands or a person's.
  const readyToSend = applications.filter(
    (a) =>
      a.status === "APPROVED" &&
      a.submittedAt === null &&
      a.submissionStatus !== "HANDED_OFF" &&
      a.submissionStatus !== "IN_PROGRESS",
  );

  if (handedOff.length === 0 && awaitingOutcome.length === 0 && readyToSend.length === 0) return null;

  return (
    <Card title="Needs you">
      <div className="space-y-6">
        {readyToSend.map((application) => (
          <div key={application.id} className="space-y-3 border-b border-[var(--color-line)] pb-5 last:border-0 last:pb-0">
            <Heading application={application} />
            <p className="text-xs text-[var(--color-ink-muted)]">
              Approved and ready. This fills the form and opens a browser window on this machine —
              nothing is sent until you click submit there yourself.
            </p>
            {canLaunchRuns ? (
              <form action={startSubmission}>
                <input type="hidden" name="applicationId" value={application.id} />
                <button type="submit" className={`${button} hover:border-emerald-500/50 hover:text-emerald-300`}>
                  Fill the form &amp; open the browser
                </button>
              </form>
            ) : (
              <p className="text-xs text-[var(--color-ink-muted)]">
                Submission drives a browser on the machine running the dashboard — start it from
                a local checkout.
              </p>
            )}
          </div>
        ))}

        {handedOff.map((application) => (
          <div key={application.id} className="space-y-3 border-b border-[var(--color-line)] pb-5 last:border-0 last:pb-0">
            <Heading application={application} />
            <p className="text-xs text-[var(--color-ink-muted)]">
              The form was filled and opened for you. Tell the system what happened — until you do,
              this application is parked: it will not be sent again, and it cannot be followed up.
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={markSentByHand}>
                <input type="hidden" name="applicationId" value={application.id} />
                <button type="submit" className={`${button} hover:border-emerald-500/50 hover:text-emerald-300`}>
                  I submitted it myself
                </button>
              </form>
              <form action={releaseHandoffAction}>
                <input type="hidden" name="applicationId" value={application.id} />
                <button type="submit" className={button}>
                  I closed it without submitting
                </button>
              </form>
            </div>
          </div>
        ))}

        {awaitingOutcome.map((application) => (
          <div key={application.id} className="space-y-3 border-b border-[var(--color-line)] pb-5 last:border-0 last:pb-0">
            <Heading application={application} />
            <p className="text-xs text-[var(--color-ink-muted)]">
              Sent{application.submittedAt ? ` on ${application.submittedAt.toISOString().slice(0, 10)}` : ""}.
              Record what came back — the objective part of a rejection is what the search learns from.
            </p>
            <form action={recordOutcomeAction} className="space-y-3">
              <input type="hidden" name="applicationId" value={application.id} />
              <div className="flex flex-wrap gap-2">
                <select name="stage" className={`${field} max-w-[16rem]`} defaultValue="APPLICATION_REVIEW">
                  {OUTCOME_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage.replace(/_/g, " ").toLowerCase()}
                    </option>
                  ))}
                </select>
                <select name="result" className={`${field} max-w-[12rem]`} defaultValue="REJECTED">
                  {OUTCOME_RESULTS.map((result) => (
                    <option key={result} value={result}>
                      {result.toLowerCase()}
                    </option>
                  ))}
                </select>
                <input name="learnedVia" placeholder="email, portal, call" className={`${field} max-w-[12rem]`} />
              </div>
              <textarea
                name="verbatim"
                rows={3}
                placeholder="Paste exactly what they said. Stored as written and never scored — only the objective codes read out of it are."
                className={field}
              />
              <button type="submit" className={`${button} hover:border-sky-500/50 hover:text-sky-300`}>
                Record outcome
              </button>
            </form>
          </div>
        ))}
      </div>
    </Card>
  );
};
