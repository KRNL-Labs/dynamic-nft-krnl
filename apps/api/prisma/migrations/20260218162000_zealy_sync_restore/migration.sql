-- ZealyConnection adjustments
ALTER TABLE "ZealyConnection" ADD COLUMN "webhookSecret" TEXT;
UPDATE "ZealyConnection" SET "apiKeyEnc" = '' WHERE "apiKeyEnc" IS NULL;
ALTER TABLE "ZealyConnection" ALTER COLUMN "apiKeyEnc" SET NOT NULL;

-- Synced Zealy quests
CREATE TABLE "ZealyQuest" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "zealyQuestId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT,
  "rawJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZealyQuest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ZealyQuest_brandId_zealyQuestId_key" ON "ZealyQuest"("brandId", "zealyQuestId");
CREATE INDEX "ZealyQuest_brandId_idx" ON "ZealyQuest"("brandId");

ALTER TABLE "ZealyQuest" ADD CONSTRAINT "ZealyQuest_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Brand quest reward rule updates
ALTER TABLE "BrandQuestRewardRule" ADD COLUMN "assetPackId" UUID;
ALTER TABLE "BrandQuestRewardRule" DROP COLUMN "canOpenLootbox";
