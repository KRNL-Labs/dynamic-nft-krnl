-- Add missing WorkflowRun tracking columns
ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "txHash" TEXT;
ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER DEFAULT 0;
ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "lastRetriedAt" TIMESTAMP(3);
ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
