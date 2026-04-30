-- Create enums for action queue
CREATE TYPE "ActionQueueStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "ActionQueueType" AS ENUM ('MINT_BASE_NFT', 'APPLY_QUEST_RESULT', 'UPDATE_XP', 'OPEN_LOOTBOX');

-- New Zealy connection table
CREATE TABLE "ZealyConnection" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "communityId" TEXT NOT NULL,
  "apiKeyEnc" TEXT,
  "oauthTokens" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZealyConnection_pkey" PRIMARY KEY ("id")
);

-- New Zealy webhook event table
CREATE TABLE "ZealyWebhookEvent" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "communityId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "zealyEventId" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "error" TEXT,
  CONSTRAINT "ZealyWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- Brand quest reward rules
CREATE TABLE "BrandQuestRewardRule" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "zealyQuestId" TEXT NOT NULL,
  "xpDelta" INTEGER NOT NULL DEFAULT 0,
  "lootKeyDelta" INTEGER NOT NULL DEFAULT 0,
  "canOpenLootbox" BOOLEAN NOT NULL DEFAULT FALSE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandQuestRewardRule_pkey" PRIMARY KEY ("id")
);

-- User identity mapping
CREATE TABLE "UserIdentity" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "zealyUserId" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- Token ownership
CREATE TABLE "TokenOwnership" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "tokenId" TEXT NOT NULL,
  "mintedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TokenOwnership_pkey" PRIMARY KEY ("id")
);

-- Action queue
CREATE TABLE "ActionQueueItem" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "tokenId" TEXT,
  "actionType" "ActionQueueType" NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "status" "ActionQueueStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionQueueItem_pkey" PRIMARY KEY ("id")
);

-- Extend WorkflowRun
ALTER TABLE "WorkflowRun" ADD COLUMN "workflowName" TEXT;
ALTER TABLE "WorkflowRun" ADD COLUMN "actionQueueItemId" UUID;
ALTER TABLE "WorkflowRun" ADD COLUMN "lastStatusPayloadJson" JSONB;

-- Unique constraints and indexes
CREATE UNIQUE INDEX "ZealyConnection_brandId_communityId_key" ON "ZealyConnection"("brandId", "communityId");
CREATE UNIQUE INDEX "ZealyWebhookEvent_zealyEventId_key" ON "ZealyWebhookEvent"("zealyEventId");
CREATE UNIQUE INDEX "BrandQuestRewardRule_brandId_zealyQuestId_key" ON "BrandQuestRewardRule"("brandId", "zealyQuestId");
CREATE UNIQUE INDEX "UserIdentity_brandId_zealyUserId_key" ON "UserIdentity"("brandId", "zealyUserId");
CREATE UNIQUE INDEX "TokenOwnership_brandId_tokenId_key" ON "TokenOwnership"("brandId", "tokenId");

CREATE INDEX "ZealyConnection_brandId_idx" ON "ZealyConnection"("brandId");
CREATE INDEX "ZealyWebhookEvent_brandId_idx" ON "ZealyWebhookEvent"("brandId");
CREATE INDEX "ZealyWebhookEvent_status_idx" ON "ZealyWebhookEvent"("status");
CREATE INDEX "BrandQuestRewardRule_brandId_idx" ON "BrandQuestRewardRule"("brandId");
CREATE INDEX "UserIdentity_brandId_idx" ON "UserIdentity"("brandId");
CREATE INDEX "UserIdentity_walletAddress_idx" ON "UserIdentity"("walletAddress");
CREATE INDEX "TokenOwnership_brandId_idx" ON "TokenOwnership"("brandId");
CREATE INDEX "TokenOwnership_walletAddress_idx" ON "TokenOwnership"("walletAddress");
CREATE INDEX "ActionQueueItem_brandId_idx" ON "ActionQueueItem"("brandId");
CREATE INDEX "ActionQueueItem_status_idx" ON "ActionQueueItem"("status");
CREATE INDEX "ActionQueueItem_actionType_idx" ON "ActionQueueItem"("actionType");

-- Foreign keys
ALTER TABLE "ZealyConnection" ADD CONSTRAINT "ZealyConnection_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ZealyWebhookEvent" ADD CONSTRAINT "ZealyWebhookEvent_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandQuestRewardRule" ADD CONSTRAINT "BrandQuestRewardRule_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TokenOwnership" ADD CONSTRAINT "TokenOwnership_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionQueueItem" ADD CONSTRAINT "ActionQueueItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_actionQueueItemId_fkey" FOREIGN KEY ("actionQueueItemId") REFERENCES "ActionQueueItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
