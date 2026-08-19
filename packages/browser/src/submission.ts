import { createLogger } from "@job-bot/shared";

const logger = createLogger("browser.submission");

/**
 * Proof that a specific application was approved by a person.
 *
 * Submission is the one irreversible, outward-facing thing this system does,
 * so the capability is not a boolean anyone can pass. A caller has to build
 * this from a persisted approval — the application id, who approved it, and
 * when — which means a submission cannot happen unless a matching approval
 * record already exists in the database.
 */
export interface SubmissionAuthorization {
  applicationId: string;
  /** The value stored in `Application.approvedBy`, e.g. "human:dashboard". */
  approvedBy: string;
  approvedAt: Date;
  /** Set when this application has already been submitted once. */
  alreadySubmittedAt: Date | null;
}

export class SubmissionRefusedError extends Error {
  constructor(reason: string) {
    super(`Refusing to submit: ${reason}`);
    this.name = "SubmissionRefusedError";
  }
}

/**
 * The preconditions for submitting, checked in one place.
 *
 * Each has a failure mode that is expensive and unfixable afterwards:
 * submitting something nobody approved, submitting the same application twice,
 * or submitting a form with required fields still empty. They throw rather
 * than return false so a caller cannot treat them as advisory.
 */
export interface SubmittableForm {
  /** Every control the extractor found on the page. */
  fieldsFound: number;
  /** Controls actually populated by the mapper or the question agent. */
  filledCount: number;
  unfilledRequired: string[];
}

export const assertMaySubmit = (
  authorization: SubmissionAuthorization,
  form: SubmittableForm,
): void => {
  if (authorization.applicationId.trim().length === 0) {
    throw new SubmissionRefusedError("no application was identified.");
  }

  if (!authorization.approvedBy.startsWith("human:")) {
    throw new SubmissionRefusedError(
      `the approval is attributed to "${authorization.approvedBy}", which is not a human actor.`,
    );
  }

  if (Number.isNaN(authorization.approvedAt.getTime())) {
    throw new SubmissionRefusedError("the approval carries no timestamp.");
  }

  if (authorization.alreadySubmittedAt !== null) {
    throw new SubmissionRefusedError(
      `this application was already submitted at ${authorization.alreadySubmittedAt.toISOString()}. A duplicate is worse than nothing.`,
    );
  }

  // A page with no controls is not an application form. Without this check a
  // posting page that never rendered its form passes vacuously — there are no
  // unfilled required fields because there are no fields — and the run clicks
  // whatever looks like a submit control.
  if (form.fieldsFound === 0) {
    throw new SubmissionRefusedError(
      "the page exposed no form controls, so this is not an application form.",
    );
  }

  if (form.filledCount === 0) {
    throw new SubmissionRefusedError(
      "no field was filled, so there is nothing to send.",
    );
  }

  if (form.unfilledRequired.length > 0) {
    throw new SubmissionRefusedError(
      `${form.unfilledRequired.length} required field(s) are still empty: ${form.unfilledRequired.join(", ")}. A half-filled application is worse than a late one.`,
    );
  }
};

export interface SubmissionEvidence {
  url: string;
  /** Text matched on the page afterwards, when the site acknowledges receipt. */
  confirmationText: string | null;
  screenshotBefore: string | null;
  screenshotAfter: string | null;
  submittedAt: Date;
}

/** Phrases sites use to acknowledge a received application. */
const CONFIRMATION_PATTERN =
  /thank you for (?:your )?(?:applying|application)|application (?:has been )?(?:received|submitted)|we(?:'ve| have) received your application|successfully submitted|thanks for applying/i;

/**
 * Controls that open an application form rather than send it.
 *
 * A posting page's primary button is "Apply", which navigates to the form.
 * Treating that as the submit control means clicking it and reporting a
 * submission that never happened, so the two are classified separately.
 */
const OPENER_PATTERNS = [
  /^apply\s*(now|here|for this (job|role|position))?$/i,
  /^view (and )?apply$/i,
  /^start (your )?application$/i,
];

const SENDER_PATTERNS = [
  /\bsubmit\b/i,
  /\bsend application\b/i,
  /\bsubmit application\b/i,
  /\bcomplete application\b/i,
  /\bconfirm and send\b/i,
  /\bfinish\b/i,
];

export type ControlRole = "opener" | "sender" | "other";

/**
 * Classifies a control by what clicking it does.
 *
 * A link is never a sender: forms submit through buttons and inputs, so an
 * anchor labelled "Apply" navigates rather than sends.
 */
export const classifyControl = (input: {
  label?: string | null;
  type?: string | null;
  name?: string | null;
  id?: string | null;
  tag?: string | null;
}): ControlRole => {
  const haystack = [input.label, input.name, input.id]
    .filter(Boolean)
    .join(" ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();

  const isLink = (input.tag ?? "").toLowerCase() === "a";

  if (OPENER_PATTERNS.some((pattern) => pattern.test(haystack.trim()))) return "opener";
  if (isLink) return "other";

  if (SENDER_PATTERNS.some((pattern) => pattern.test(haystack))) return "sender";
  if ((input.type ?? "").toLowerCase() === "submit") return "sender";

  return "other";
};

/**
 * Whether the page acknowledged the submission.
 *
 * A click that appears to work but silently fails is the worst outcome — the
 * job is marked applied and no application exists. Absence of a confirmation
 * is reported rather than assumed benign.
 */
export const findConfirmation = (pageText: string): string | null => {
  const match = CONFIRMATION_PATTERN.exec(pageText);
  return match === null ? null : match[0];
};

export const logSubmissionIntent = (
  authorization: SubmissionAuthorization,
  label: string,
): void => {
  logger.warn("Submitting an application", {
    applicationId: authorization.applicationId,
    approvedBy: authorization.approvedBy,
    approvedAt: authorization.approvedAt.toISOString(),
    control: label,
  });
};
