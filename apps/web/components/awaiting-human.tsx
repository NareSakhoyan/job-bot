import { OUTCOME_RESULTS, OUTCOME_STAGES } from "@job-bot/shared";
import { markSentByHand, recordOutcomeAction, releaseHandoffAction } from "@/app/applications/actions";
import { Card } from "@/components/ui";

type Awaiting = {
  id: string;
  submissionStatus: string;
  submittedAt: Date | null;
  job: { company: string; title: string; url: string };
};

const field =
  "w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-sky-500/60";
const button =
  "rounded-md border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]";

/**
 * The decisions only a person can make, in the place they are looking.
 *
 * Whether a handed-off form was actually submitted, and what a company later
 * said, are both facts that reach a human and never reach the pipeline. They
 * were terminal-only commands, which made the dashboard a viewer of a process
 * it could not participate in.
 */
export const AwaitingHuman = ({ applications }: { applications: Awaiting[] }) => {
  if (applications.length === 0) return null;

  return (
    <Card title={`Waiting on you (${applications.length})`}>
      <ul className="space-y-5">
        {applications.map((application) => {
          const handedOff = application.submittedAt === null;

          return (
            <li key={application.id} className="space-y-3 border-b border-[var(--color-line)] pb-5 last:border-0 last:pb-0">
              <div>
                <a
                  href={application.job.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm font-medium text-[var(--color-ink)] underline decoration-[var(--color-line)] underline-offset-4"
                >
                  {application.job.company} — {application.job.title}
                </a>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {handedOff
                    ? "The form was filled and opened for you. Did you send it?"
                    : `Sent ${application.submittedAt?.toISOString().slice(0, 10)} — no outcome recorded yet.`}
                </p>
              </div>

              {handedOff ? (
                <div className="flex flex-wrap gap-2">
                  <form action={markSentByHand}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <button type="submit" className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500">
                      I submitted it
                    </button>
                  </form>
                  <form action={releaseHandoffAction}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <button type="submit" className={button}>
                      I closed it without submitting
                    </button>
                  </form>
                </div>
              ) : (
                <form action={recordOutcomeAction} className="space-y-2">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <div className="flex flex-wrap gap-2">
                    <select name="stage" className={field} style={{ maxWidth: "13rem" }} defaultValue="APPLICATION_REVIEW">
                      {OUTCOME_STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage.replace(/_/g, " ").toLowerCase()}
                        </option>
                      ))}
                    </select>
                    <select name="result" className={field} style={{ maxWidth: "10rem" }} defaultValue="REJECTED">
                      {OUTCOME_RESULTS.map((result) => (
                        <option key={result} value={result}>
                          {result.toLowerCase()}
                        </option>
                      ))}
                    </select>
                    <input name="learnedVia" placeholder="email, portal, call" className={field} style={{ maxWidth: "12rem" }} />
                  </div>
                  <textarea
                    name="verbatim"
                    rows={3}
                    placeholder="Paste exactly what they said. Stored as written and never scored — only the objective reasons read out of it are."
                    className={field}
                  />
                  <button type="submit" className={button}>
                    Record outcome
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
};
