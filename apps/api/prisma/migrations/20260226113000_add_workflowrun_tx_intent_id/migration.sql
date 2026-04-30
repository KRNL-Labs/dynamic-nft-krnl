ALTER TABLE "WorkflowRun"
ADD COLUMN "txIntentId" TEXT;

CREATE INDEX IF NOT EXISTS "WorkflowRun_txIntentId_idx"
ON "WorkflowRun" ("txIntentId");
