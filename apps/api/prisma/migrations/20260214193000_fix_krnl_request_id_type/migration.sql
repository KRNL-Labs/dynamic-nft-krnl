-- Ensure krnlRequestId exists as TEXT
ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "krnlRequestId" TEXT;
ALTER TABLE "WorkflowRun" ALTER COLUMN "krnlRequestId" TYPE TEXT USING "krnlRequestId"::text;
