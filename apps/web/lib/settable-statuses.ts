/**
 * Statuses a person may set by hand from the dashboard.
 *
 * Deliberately excludes the ones the pipeline owns. `SUBMITTED` is absent
 * because setting it without also stamping `submittedAt` would produce a row
 * that looks sent while still being eligible to send — that path goes through
 * `markAppliedByHand`, which does both. `APPROVED` is absent because approval
 * is a recorded decision with its own audit trail on /review, not a dropdown.
 * The rest is bookkeeping a person legitimately owns.
 *
 * Lives outside the actions module because every export of a "use server"
 * file must be an async function.
 */
export const SETTABLE_STATUSES = [
  "ANALYZED",
  "SHORTLISTED",
  "REJECTED",
  "WITHDRAWN",
  "INTERVIEW",
  "REJECTED_BY_COMPANY",
] as const;
