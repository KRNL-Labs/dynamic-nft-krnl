CREATE TABLE IF NOT EXISTS "BrandLootboxConfig" (
  "brandId" UUID NOT NULL,
  "xpPerLootKey" INT NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandLootboxConfig_pkey" PRIMARY KEY ("brandId")
);

ALTER TABLE "BrandLootboxConfig"
  ADD CONSTRAINT "BrandLootboxConfig_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "UserLootBalance" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "wallet" TEXT NOT NULL,
  "lootKeys" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserLootBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserLootBalance_brandId_wallet_key" ON "UserLootBalance"("brandId", "wallet");
CREATE INDEX IF NOT EXISTS "UserLootBalance_brandId_idx" ON "UserLootBalance"("brandId");
CREATE INDEX IF NOT EXISTS "UserLootBalance_wallet_idx" ON "UserLootBalance"("wallet");

ALTER TABLE "UserLootBalance"
  ADD CONSTRAINT "UserLootBalance_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
