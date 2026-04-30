-- Add scopeType/scopeId for workflow run scoping
DO $$ BEGIN
  CREATE TYPE "WorkflowRunScopeType" AS ENUM ('PLATFORM', 'BRAND');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "scopeType" "WorkflowRunScopeType" NOT NULL DEFAULT 'BRAND';
ALTER TABLE "WorkflowRun" ADD COLUMN IF NOT EXISTS "scopeId" UUID;

UPDATE "WorkflowRun"
SET "scopeType" = 'BRAND',
    "scopeId" = "brandId"
WHERE "scopeType" IS NULL
   OR "scopeId" IS NULL;
