-- Add expectedBaseUri to WorkflowRun and baseUriOnchain to BrandNftConfig
ALTER TABLE "WorkflowRun" ADD COLUMN "expectedBaseUri" TEXT;
ALTER TABLE "BrandNftConfig" ADD COLUMN "baseUriOnchain" TEXT;
