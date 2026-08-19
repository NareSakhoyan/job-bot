-- CreateEnum
CREATE TYPE "EducationKind" AS ENUM ('DEGREE', 'COURSE', 'CERTIFICATION');

-- CreateTable
CREATE TABLE "education" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "kind" "EducationKind" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "education_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "education_slug_key" ON "education"("slug");

-- CreateIndex
CREATE INDEX "education_profileId_idx" ON "education"("profileId");

-- AddForeignKey
ALTER TABLE "education" ADD CONSTRAINT "education_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
