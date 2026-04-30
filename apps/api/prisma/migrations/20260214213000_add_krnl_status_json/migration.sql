-- Add krnlStatusJson to WorkflowRun
ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "krnlStatusJson" JSONB;

-- Index requestId for faster lookup
CREATE INDEX IF NOT EXISTS "WorkflowRun_krnlRequestId_idx" ON "WorkflowRun"("krnlRequestId");
