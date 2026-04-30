-- Add krnlIntentId to WorkflowRun
ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "krnlIntentId" TEXT;
