ALTER TABLE "LootboxConfig"
  ADD COLUMN IF NOT EXISTS "xpPerLootKey" INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "lootKeysPerOpen" INT NOT NULL DEFAULT 1;

UPDATE "LootboxConfig"
SET "xpPerLootKey" = CASE
  WHEN "xpCost" IS NOT NULL AND "xpCost" > 0 THEN "xpCost"
  ELSE "xpPerLootKey"
END
WHERE "xpPerLootKey" = 100;

CREATE TABLE IF NOT EXISTS "UserBrandEconomyLedger" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "wallet" TEXT NOT NULL,
  "zealyXpTotal" INT NOT NULL DEFAULT 0,
  "xpSpent" INT NOT NULL DEFAULT 0,
  "lootKeysBalance" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBrandEconomyLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserBrandEconomyLedger_brandId_wallet_key"
ON "UserBrandEconomyLedger"("brandId", "wallet");
CREATE INDEX IF NOT EXISTS "UserBrandEconomyLedger_brandId_idx"
ON "UserBrandEconomyLedger"("brandId");
CREATE INDEX IF NOT EXISTS "UserBrandEconomyLedger_wallet_idx"
ON "UserBrandEconomyLedger"("wallet");

ALTER TABLE "UserBrandEconomyLedger"
  ADD CONSTRAINT "UserBrandEconomyLedger_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "UserBrandEconomyLedger" (
  "id",
  "brandId",
  "wallet",
  "zealyXpTotal",
  "xpSpent",
  "lootKeysBalance",
  "createdAt",
  "updatedAt"
)
SELECT
  (
    SUBSTRING(MD5(merged."brandId"::text || ':' || merged."wallet") FROM 1 FOR 8) || '-' ||
    SUBSTRING(MD5(merged."brandId"::text || ':' || merged."wallet") FROM 9 FOR 4) || '-' ||
    SUBSTRING(MD5(merged."brandId"::text || ':' || merged."wallet") FROM 13 FOR 4) || '-' ||
    SUBSTRING(MD5(merged."brandId"::text || ':' || merged."wallet") FROM 17 FOR 4) || '-' ||
    SUBSTRING(MD5(merged."brandId"::text || ':' || merged."wallet") FROM 21 FOR 12)
  )::UUID,
  merged."brandId",
  merged."wallet",
  MAX(merged."zealyXpTotal")::INT,
  MAX(merged."xpSpent")::INT,
  MAX(merged."lootKeysBalance")::INT,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT
    l."brandId",
    l."wallet",
    l."xpBalance" AS "zealyXpTotal",
    0 AS "xpSpent",
    0 AS "lootKeysBalance"
  FROM "UserBrandXpLedger" l
  UNION ALL
  SELECT
    l."brandId",
    l."wallet",
    0 AS "zealyXpTotal",
    l."spentXp" AS "xpSpent",
    0 AS "lootKeysBalance"
  FROM "BrandUserXpLedger" l
  UNION ALL
  SELECT
    l."brandId",
    l."wallet",
    0 AS "zealyXpTotal",
    0 AS "xpSpent",
    l."lootKeys" AS "lootKeysBalance"
  FROM "UserLootBalance" l
  UNION ALL
  SELECT
    l."brandId",
    l."wallet",
    0 AS "zealyXpTotal",
    0 AS "xpSpent",
    l."lootKeysBalance" AS "lootKeysBalance"
  FROM "UserBrandLootLedger" l
  UNION ALL
  SELECT
    l."brandId",
    l."walletAddress" AS "wallet",
    l."totalXp" AS "zealyXpTotal",
    0 AS "xpSpent",
    l."lootKeys" AS "lootKeysBalance"
  FROM "BrandUserLedger" l
) merged
GROUP BY merged."brandId", merged."wallet"
ON CONFLICT ("brandId", "wallet") DO NOTHING;
