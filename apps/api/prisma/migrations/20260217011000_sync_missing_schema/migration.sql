-- Add missing columns used by code
ALTER TABLE "BrandNftConfig" ADD COLUMN IF NOT EXISTS "metadataBaseURI" TEXT;
ALTER TABLE "BrandNftConfig" ADD COLUMN IF NOT EXISTS "activeAssetPackId" UUID;

ALTER TABLE "NftAssetPack" ADD COLUMN IF NOT EXISTS "baseImageKey" TEXT;
ALTER TABLE "NftAssetPack" ADD COLUMN IF NOT EXISTS "previewImageKey" TEXT;

-- ZealyEvent table
CREATE TABLE IF NOT EXISTS "ZealyEvent" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "zealySubdomain" TEXT NOT NULL,
    "zealyQuestId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "workflowRunId" TEXT,
    "txHash" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZealyEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ZealyEvent_brandId_eventKey_key" ON "ZealyEvent"("brandId", "eventKey");
CREATE INDEX IF NOT EXISTS "ZealyEvent_brandId_idx" ON "ZealyEvent"("brandId");

ALTER TABLE "ZealyEvent" ADD CONSTRAINT "ZealyEvent_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- NftAssetObject table
CREATE TABLE IF NOT EXISTS "NftAssetObject" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "assetPackId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "stateKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NftAssetObject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NftAssetObject_brandId_idx" ON "NftAssetObject"("brandId");
CREATE INDEX IF NOT EXISTS "NftAssetObject_assetPackId_idx" ON "NftAssetObject"("assetPackId");

ALTER TABLE "NftAssetObject" ADD CONSTRAINT "NftAssetObject_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NftAssetObject" ADD CONSTRAINT "NftAssetObject_assetPackId_fkey"
FOREIGN KEY ("assetPackId") REFERENCES "NftAssetPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- NftStateMapping table
CREATE TABLE IF NOT EXISTS "NftStateMapping" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "assetPackId" UUID NOT NULL,
    "traitName" TEXT NOT NULL,
    "traitValue" TEXT NOT NULL,
    "imageObjectId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NftStateMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NftStateMapping_assetPackId_traitName_traitValue_key"
ON "NftStateMapping"("assetPackId", "traitName", "traitValue");

CREATE INDEX IF NOT EXISTS "NftStateMapping_brandId_idx" ON "NftStateMapping"("brandId");
CREATE INDEX IF NOT EXISTS "NftStateMapping_assetPackId_idx" ON "NftStateMapping"("assetPackId");

ALTER TABLE "NftStateMapping" ADD CONSTRAINT "NftStateMapping_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NftStateMapping" ADD CONSTRAINT "NftStateMapping_assetPackId_fkey"
FOREIGN KEY ("assetPackId") REFERENCES "NftAssetPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NftStateMapping" ADD CONSTRAINT "NftStateMapping_imageObjectId_fkey"
FOREIGN KEY ("imageObjectId") REFERENCES "NftAssetObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
