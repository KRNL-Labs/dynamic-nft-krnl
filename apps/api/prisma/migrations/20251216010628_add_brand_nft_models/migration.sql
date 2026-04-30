-- CreateTable
CREATE TABLE "BrandNftConfig" (
    "brandId" UUID NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "rpcUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandNftConfig_pkey" PRIMARY KEY ("brandId")
);

-- CreateTable
CREATE TABLE "NftAssetPack" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseImageUrl" TEXT,
    "previewImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NftAssetPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestReward" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "questId" UUID NOT NULL,
    "assetPackId" UUID,
    "xpDelta" INTEGER,
    "lootKeysDelta" INTEGER,
    "traitUpdates" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NftAssetPack_brandId_idx" ON "NftAssetPack"("brandId");

-- CreateIndex
CREATE INDEX "QuestReward_brandId_idx" ON "QuestReward"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestReward_questId_key" ON "QuestReward"("questId");

-- AddForeignKey
ALTER TABLE "BrandNftConfig" ADD CONSTRAINT "BrandNftConfig_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NftAssetPack" ADD CONSTRAINT "NftAssetPack_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestReward" ADD CONSTRAINT "QuestReward_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestReward" ADD CONSTRAINT "QuestReward_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestReward" ADD CONSTRAINT "QuestReward_assetPackId_fkey" FOREIGN KEY ("assetPackId") REFERENCES "NftAssetPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
