DO $$ BEGIN
  CREATE TYPE "WorkflowRunType" AS ENUM (
    'SET_METADATA_URI',
    'MINT_BASE_NFT',
    'OPEN_LOOTBOX',
    'SET_ACTIVE_TRAITS',
    'QUEST_REWARD'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "WorkflowRun"
SET "type" = CASE
  WHEN "type" IN ('mint', 'mint-base-nft', 'mint_base_nft', 'mint_base') THEN 'MINT_BASE_NFT'
  WHEN "type" IN ('lootbox', 'open_lootbox', 'open-lootbox', 'OPEN_LOOTBOX') THEN 'OPEN_LOOTBOX'
  WHEN "type" IN ('set_active_traits', 'SET_ACTIVE_TRAITS') THEN 'SET_ACTIVE_TRAITS'
  WHEN "type" IN ('quest_reward', 'apply_quest_result', 'quest-reward') THEN 'QUEST_REWARD'
  WHEN "type" LIKE '%metadata%' THEN 'SET_METADATA_URI'
  ELSE 'QUEST_REWARD'
END;

ALTER TABLE "WorkflowRun"
  ALTER COLUMN "type" TYPE "WorkflowRunType"
  USING "type"::"WorkflowRunType";

CREATE TABLE "BrandUser" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandUser_brandId_walletAddress_key" ON "BrandUser"("brandId", "walletAddress");
CREATE INDEX "BrandUser_brandId_idx" ON "BrandUser"("brandId");
CREATE INDEX "BrandUser_walletAddress_idx" ON "BrandUser"("walletAddress");

ALTER TABLE "BrandUser"
  ADD CONSTRAINT "BrandUser_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "UnlockedTrait" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "wallet" TEXT NOT NULL,
  "tokenId" TEXT,
  "traitKey" TEXT NOT NULL,
  "traitValue" TEXT NOT NULL,
  "sourceRunId" TEXT NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "activeAt" TIMESTAMP(3),
  CONSTRAINT "UnlockedTrait_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnlockedTrait_brandId_wallet_traitKey_traitValue_key" ON "UnlockedTrait"("brandId", "wallet", "traitKey", "traitValue");
CREATE INDEX "UnlockedTrait_brandId_idx" ON "UnlockedTrait"("brandId");
CREATE INDEX "UnlockedTrait_wallet_idx" ON "UnlockedTrait"("wallet");
CREATE INDEX "UnlockedTrait_traitKey_idx" ON "UnlockedTrait"("traitKey");

ALTER TABLE "UnlockedTrait"
  ADD CONSTRAINT "UnlockedTrait_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
