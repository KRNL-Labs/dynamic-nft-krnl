ALTER TABLE "Brand"
  ADD COLUMN IF NOT EXISTS "publicEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "LootboxConfig" (
  "brandId" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "xpCost" INT NOT NULL DEFAULT 0,
  "maxUnlocksPerOpen" INT NOT NULL DEFAULT 1,
  "lootTable" JSONB NOT NULL DEFAULT '{"entries":[]}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LootboxConfig_pkey" PRIMARY KEY ("brandId")
);

ALTER TABLE "LootboxConfig"
  ADD CONSTRAINT "LootboxConfig_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BrandUserXpLedger" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "wallet" TEXT NOT NULL,
  "spentXp" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandUserXpLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrandUserXpLedger_brandId_wallet_key" ON "BrandUserXpLedger"("brandId", "wallet");
CREATE INDEX IF NOT EXISTS "BrandUserXpLedger_brandId_idx" ON "BrandUserXpLedger"("brandId");
CREATE INDEX IF NOT EXISTS "BrandUserXpLedger_wallet_idx" ON "BrandUserXpLedger"("wallet");

ALTER TABLE "BrandUserXpLedger"
  ADD CONSTRAINT "BrandUserXpLedger_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BrandUserUnlockedTrait" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "wallet" TEXT NOT NULL,
  "traitName" TEXT NOT NULL,
  "traitValue" TEXT NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandUserUnlockedTrait_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrandUserUnlockedTrait_brandId_wallet_traitName_traitValue_key"
ON "BrandUserUnlockedTrait"("brandId", "wallet", "traitName", "traitValue");
CREATE INDEX IF NOT EXISTS "BrandUserUnlockedTrait_brandId_idx" ON "BrandUserUnlockedTrait"("brandId");
CREATE INDEX IF NOT EXISTS "BrandUserUnlockedTrait_wallet_idx" ON "BrandUserUnlockedTrait"("wallet");

ALTER TABLE "BrandUserUnlockedTrait"
  ADD CONSTRAINT "BrandUserUnlockedTrait_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
