-- Add KRNL execution hash + onchain tx hash
ALTER TABLE "WorkflowRun" ADD COLUMN "krnlExecutionHash" TEXT;
ALTER TABLE "WorkflowRun" ADD COLUMN "chainTxHash" TEXT;
