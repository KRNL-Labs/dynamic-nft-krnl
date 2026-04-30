CREATE TABLE "BrandUserLedger" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "totalXp" INTEGER NOT NULL DEFAULT 0,
  "lootKeys" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandUserLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZealyRewardAudit" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "zealyQuestId" TEXT NOT NULL,
  "xpDelta" INTEGER NOT NULL,
  "lootKeyDelta" INTEGER NOT NULL,
  "webhookEventId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZealyRewardAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandUserLedger_brandId_walletAddress_key" ON "BrandUserLedger"("brandId", "walletAddress");
CREATE INDEX "BrandUserLedger_brandId_idx" ON "BrandUserLedger"("brandId");
CREATE INDEX "BrandUserLedger_walletAddress_idx" ON "BrandUserLedger"("walletAddress");

CREATE UNIQUE INDEX "ZealyRewardAudit_webhookEventId_key" ON "ZealyRewardAudit"("webhookEventId");
CREATE INDEX "ZealyRewardAudit_brandId_idx" ON "ZealyRewardAudit"("brandId");
CREATE INDEX "ZealyRewardAudit_walletAddress_idx" ON "ZealyRewardAudit"("walletAddress");

ALTER TABLE "BrandUserLedger"
  ADD CONSTRAINT "BrandUserLedger_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ZealyRewardAudit"
  ADD CONSTRAINT "ZealyRewardAudit_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
