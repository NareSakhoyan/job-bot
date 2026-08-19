-- CreateEnum
CREATE TYPE "PipelineRunKind" AS ENUM ('DISCOVER', 'MATCH', 'PREPARE');

-- CreateEnum
CREATE TYPE "PipelineRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" TEXT NOT NULL,
    "kind" "PipelineRunKind" NOT NULL,
    "status" "PipelineRunStatus" NOT NULL DEFAULT 'RUNNING',
    "args" TEXT[],
    "startedBy" TEXT NOT NULL,
    "pid" INTEGER,
    "note" TEXT,
    "done" INTEGER,
    "total" INTEGER,
    "error" TEXT,
    "logPath" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_runs_status_startedAt_idx" ON "pipeline_runs"("status", "startedAt");
