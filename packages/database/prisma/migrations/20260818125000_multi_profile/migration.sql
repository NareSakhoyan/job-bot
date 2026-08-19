-- Matches and applications become per-profile so the system can search under
-- several CVs. Jobs stay global: a posting is a posting.
--
-- Written by hand rather than generated so existing rows are preserved: the
-- columns are added nullable, backfilled from the single profile that existed
-- before this change, and only then made NOT NULL.

-- The seeded profile's slug now has to match its directory under data/profiles/.
UPDATE "user_profiles" SET "slug" = 'nare' WHERE "slug" = 'primary';

ALTER TABLE "job_matches" ADD COLUMN "profileId" TEXT;
ALTER TABLE "applications" ADD COLUMN "profileId" TEXT;

UPDATE "job_matches" SET "profileId" = (SELECT "id" FROM "user_profiles" ORDER BY "createdAt" ASC LIMIT 1);
UPDATE "applications" SET "profileId" = (SELECT "id" FROM "user_profiles" ORDER BY "createdAt" ASC LIMIT 1);

ALTER TABLE "job_matches" ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "applications" ALTER COLUMN "profileId" SET NOT NULL;

DROP INDEX IF EXISTS "job_matches_jobId_key";
DROP INDEX IF EXISTS "applications_jobId_key";
DROP INDEX IF EXISTS "job_matches_score_idx";
DROP INDEX IF EXISTS "applications_status_idx";

CREATE UNIQUE INDEX "job_matches_profileId_jobId_key" ON "job_matches"("profileId", "jobId");
CREATE UNIQUE INDEX "applications_profileId_jobId_key" ON "applications"("profileId", "jobId");
CREATE INDEX "job_matches_profileId_score_idx" ON "job_matches"("profileId", "score");
CREATE INDEX "applications_profileId_status_idx" ON "applications"("profileId", "status");

ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
