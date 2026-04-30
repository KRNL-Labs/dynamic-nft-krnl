-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "questId" TEXT,
    "zealyQuestId" TEXT,
    "tokenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowRun_brandId_idx" ON "WorkflowRun"("brandId");

-- CreateIndex
CREATE INDEX "WorkflowRun_type_idx" ON "WorkflowRun"("type");

-- CreateIndex
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
