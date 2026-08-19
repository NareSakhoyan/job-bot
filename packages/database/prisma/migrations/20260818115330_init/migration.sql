-- CreateEnum
CREATE TYPE "RemotePreference" AS ENUM ('REMOTE_ONLY', 'HYBRID', 'ONSITE', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'FREELANCE');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('EXPERT', 'ADVANCED', 'INTERMEDIATE', 'BEGINNER');

-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('YEAR', 'MONTH', 'DAY', 'HOUR');

-- CreateEnum
CREATE TYPE "WorkAuthorizationStatus" AS ENUM ('CITIZEN', 'PERMANENT_RESIDENT', 'WORK_VISA', 'STUDENT_VISA', 'REQUIRES_SPONSORSHIP');

-- CreateEnum
CREATE TYPE "MatchRecommendation" AS ENUM ('STRONG_MATCH', 'GOOD_MATCH', 'POSSIBLE_MATCH', 'WEAK_MATCH', 'NOT_RECOMMENDED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DISCOVERED', 'ANALYZED', 'SHORTLISTED', 'REJECTED', 'PREPARING', 'READY_FOR_REVIEW', 'APPROVED', 'SUBMITTED', 'WITHDRAWN', 'REJECTED_BY_COMPANY', 'INTERVIEW');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('NOT_STARTED', 'FORM_FILLED', 'AWAITING_APPROVAL', 'SUBMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "yearsOfExperience" DOUBLE PRECISION NOT NULL,
    "targetRoles" TEXT[],
    "preferredLocations" TEXT[],
    "remotePreference" "RemotePreference" NOT NULL,
    "employmentTypes" "EmploymentType"[],
    "industries" TEXT[],
    "excludedCompanies" TEXT[],
    "excludedTechnologies" TEXT[],
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT NOT NULL DEFAULT 'USD',
    "salaryPeriod" "SalaryPeriod" NOT NULL DEFAULT 'YEAR',
    "workAuthCountry" TEXT NOT NULL,
    "workAuthStatus" "WorkAuthorizationStatus" NOT NULL,
    "requiresSponsorship" BOOLEAN NOT NULL DEFAULT false,
    "workAuthNotes" TEXT,
    "githubUrl" TEXT,
    "linkedinUrl" TEXT,
    "websiteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_skills" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "level" "SkillLevel" NOT NULL,
    "yearsUsed" DOUBLE PRECISION,

    CONSTRAINT "profile_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "location" TEXT NOT NULL,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "technologies" TEXT[],
    "responsibilities" TEXT[],
    "achievements" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experience_projects" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "technologies" TEXT[],
    "url" TEXT,
    "impact" TEXT,

    CONSTRAINT "experience_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "employmentType" "EmploymentType",
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "salaryPeriod" "SalaryPeriod",
    "description" TEXT NOT NULL,
    "descriptionText" TEXT NOT NULL,
    "requirements" TEXT[],
    "responsibilities" TEXT[],
    "technologies" TEXT[],
    "postedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "primarySource" TEXT NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_sightings" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_sightings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_matches" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "deterministicScore" INTEGER NOT NULL,
    "recommendation" "MatchRecommendation" NOT NULL,
    "factors" JSONB NOT NULL,
    "matchingSkills" TEXT[],
    "missingSkills" TEXT[],
    "concerns" TEXT[],
    "reasoning" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DISCOVERED',
    "submissionStatus" "SubmissionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "tailoredResume" JSONB,
    "coverLetter" TEXT,
    "answers" JSONB,
    "notes" TEXT,
    "readyAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_events" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus",
    "actor" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_slug_key" ON "user_profiles"("slug");

-- CreateIndex
CREATE INDEX "profile_skills_profileId_idx" ON "profile_skills"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_skills_profileId_name_key" ON "profile_skills"("profileId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "experiences_slug_key" ON "experiences"("slug");

-- CreateIndex
CREATE INDEX "experiences_profileId_idx" ON "experiences"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "experience_projects_slug_key" ON "experience_projects"("slug");

-- CreateIndex
CREATE INDEX "experience_projects_experienceId_idx" ON "experience_projects"("experienceId");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_dedupeKey_key" ON "jobs"("dedupeKey");

-- CreateIndex
CREATE INDEX "jobs_company_idx" ON "jobs"("company");

-- CreateIndex
CREATE INDEX "jobs_discoveredAt_idx" ON "jobs"("discoveredAt");

-- CreateIndex
CREATE INDEX "job_sightings_jobId_idx" ON "job_sightings"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "job_sightings_source_externalId_key" ON "job_sightings"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "job_matches_jobId_key" ON "job_matches"("jobId");

-- CreateIndex
CREATE INDEX "job_matches_score_idx" ON "job_matches"("score");

-- CreateIndex
CREATE UNIQUE INDEX "applications_jobId_key" ON "applications"("jobId");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "application_events_applicationId_createdAt_idx" ON "application_events"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "profile_skills" ADD CONSTRAINT "profile_skills_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_projects" ADD CONSTRAINT "experience_projects_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_sightings" ADD CONSTRAINT "job_sightings_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
