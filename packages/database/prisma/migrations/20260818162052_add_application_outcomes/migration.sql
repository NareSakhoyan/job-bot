-- CreateEnum
CREATE TYPE "OutcomeStage" AS ENUM ('NO_RESPONSE', 'APPLICATION_REVIEW', 'RECRUITER_SCREEN', 'TECHNICAL_SCREEN', 'INTERVIEW_LOOP', 'FINAL_ROUND', 'OFFER_STAGE');

-- CreateEnum
CREATE TYPE "OutcomeResult" AS ENUM ('REJECTED', 'GHOSTED', 'WITHDRAWN', 'OFFER', 'ONGOING');

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('INSUFFICIENT_YEARS', 'SENIORITY_MISMATCH', 'MISSING_TECHNOLOGY', 'DOMAIN_EXPERIENCE', 'WORK_AUTHORIZATION', 'LOCATION_OR_TIMEZONE', 'LANGUAGE_REQUIREMENT', 'SALARY_EXPECTATION', 'ROLE_CLOSED', 'INTERNAL_CANDIDATE', 'STRONGER_APPLICANTS', 'NO_REASON_GIVEN');

-- CreateTable
CREATE TABLE "application_outcomes" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stage" "OutcomeStage" NOT NULL,
    "result" "OutcomeResult" NOT NULL,
    "verbatim" TEXT,
    "reasons" "RejectionReason"[],
    "recordedBy" TEXT NOT NULL,
    "learnedVia" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "application_outcomes_applicationId_key" ON "application_outcomes"("applicationId");

-- CreateIndex
CREATE INDEX "application_outcomes_result_decidedAt_idx" ON "application_outcomes"("result", "decidedAt");

-- AddForeignKey
ALTER TABLE "application_outcomes" ADD CONSTRAINT "application_outcomes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
