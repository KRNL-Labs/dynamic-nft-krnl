CREATE TABLE IF NOT EXISTS "UserBrandXpLedger" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "wallet" TEXT NOT NULL,
  "xpBalance" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBrandXpLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserBrandXpLedger_brandId_wallet_key" ON "UserBrandXpLedger"("brandId", "wallet");
CREATE INDEX IF NOT EXISTS "UserBrandXpLedger_brandId_idx" ON "UserBrandXpLedger"("brandId");
CREATE INDEX IF NOT EXISTS "UserBrandXpLedger_wallet_idx" ON "UserBrandXpLedger"("wallet");

ALTER TABLE "UserBrandXpLedger"
  ADD CONSTRAINT "UserBrandXpLedger_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "UserBrandLootLedger" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "wallet" TEXT NOT NULL,
  "lootKeysBalance" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBrandLootLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserBrandLootLedger_brandId_wallet_key" ON "UserBrandLootLedger"("brandId", "wallet");
CREATE INDEX IF NOT EXISTS "UserBrandLootLedger_brandId_idx" ON "UserBrandLootLedger"("brandId");
CREATE INDEX IF NOT EXISTS "UserBrandLootLedger_wallet_idx" ON "UserBrandLootLedger"("wallet");

ALTER TABLE "UserBrandLootLedger"
  ADD CONSTRAINT "UserBrandLootLedger_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BrandRewardRule" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "questId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lootKeysDelta" INT NOT NULL DEFAULT 0,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandRewardRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrandRewardRule_brandId_questId_key" ON "BrandRewardRule"("brandId", "questId");
CREATE INDEX IF NOT EXISTS "BrandRewardRule_brandId_idx" ON "BrandRewardRule"("brandId");

ALTER TABLE "BrandRewardRule"
  ADD CONSTRAINT "BrandRewardRule_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ZealyQuest"
  ADD COLUMN IF NOT EXISTS "xp" INT;
