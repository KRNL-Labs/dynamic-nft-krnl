DO $$ BEGIN
  CREATE TYPE "WorkflowRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "WorkflowRun"
SET "status" = CASE
  WHEN "status" ILIKE 'running' THEN 'running'
  WHEN "status" ILIKE 'queued' OR "status" ILIKE 'submitted' THEN 'queued'
  WHEN "status" ILIKE 'succeeded' OR "status" ILIKE 'success' OR "status" ILIKE 'krnl_done' THEN 'succeeded'
  ELSE 'failed'
END;

UPDATE "WorkflowRun"
SET "krnlIntentId" = COALESCE("krnlIntentId", "krnlRunRef", "krnlRequestId", "id"::text)
WHERE "krnlIntentId" IS NULL;

ALTER TABLE "WorkflowRun"
  ALTER COLUMN "status" TYPE "WorkflowRunStatus"
  USING "status"::"WorkflowRunStatus";

ALTER TABLE "WorkflowRun"
  ALTER COLUMN "status" SET DEFAULT 'queued';

ALTER TABLE "WorkflowRun"
  ALTER COLUMN "krnlIntentId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "WorkflowRun_krnlIntentId_idx" ON "WorkflowRun"("krnlIntentId");
