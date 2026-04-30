CREATE TABLE IF NOT EXISTS "LootKeyPurchaseAudit" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "zealyUserId" TEXT NOT NULL,
  "deltaLootKeys" INT NOT NULL,
  "deltaXp" INT NOT NULL,
  "type" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LootKeyPurchaseAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LootKeyPurchaseAudit_brandId_idx" ON "LootKeyPurchaseAudit"("brandId");
CREATE INDEX IF NOT EXISTS "LootKeyPurchaseAudit_walletAddress_idx" ON "LootKeyPurchaseAudit"("walletAddress");
CREATE INDEX IF NOT EXISTS "LootKeyPurchaseAudit_zealyUserId_idx" ON "LootKeyPurchaseAudit"("zealyUserId");

ALTER TABLE "LootKeyPurchaseAudit"
  ADD CONSTRAINT "LootKeyPurchaseAudit_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
