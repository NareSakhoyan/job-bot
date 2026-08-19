-- Submission gains states that distinguish "we clicked and the site confirmed"
-- from "we clicked and heard nothing", plus a claim state that makes concurrent
-- submission runs safe.
--
-- IN_PROGRESS is claimed before the click and replaced by the outcome, so a run
-- that dies mid-flight leaves a visible stuck row rather than one that looks
-- eligible again.
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'HANDED_OFF';
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'UNCONFIRMED';

-- Postings disappear from boards. Without this a closed job keeps being scored,
-- prepared, and potentially applied to.
ALTER TABLE "jobs" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "jobs" ADD COLUMN "closedAt" TIMESTAMP(3);

-- Existing rows were last seen when they were discovered; anything else would
-- mark the whole backlog stale on the next sweep.
UPDATE "jobs" SET "lastSeenAt" = "discoveredAt" WHERE "lastSeenAt" IS NULL;

ALTER TABLE "jobs" ALTER COLUMN "lastSeenAt" SET NOT NULL;
ALTER TABLE "jobs" ALTER COLUMN "lastSeenAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "jobs_closedAt_idx" ON "jobs"("closedAt");
