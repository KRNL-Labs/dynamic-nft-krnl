-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "privyId" TEXT NOT NULL,
    "wallet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "primaryChainId" INTEGER NOT NULL,
    "hasZealyConfig" BOOLEAN NOT NULL DEFAULT false,
    "sponsorshipCredits" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandZealyConfig" (
    "brandId" UUID NOT NULL,
    "zealySubdomain" TEXT NOT NULL,
    "zealyApiKeyEnc" TEXT NOT NULL,
    "zealyWebhookSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandZealyConfig_pkey" PRIMARY KEY ("brandId")
);

-- CreateTable
CREATE TABLE "BrandMembership" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "userId" UUID,
    "wallet" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quest" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "zealyQuestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQuestState" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "questId" UUID NOT NULL,
    "userId" UUID,
    "wallet" TEXT NOT NULL,
    "zealyUserId" TEXT,
    "status" TEXT NOT NULL,
    "lastUpdateAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserQuestState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "externalRef" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZealyWebhookLog" (
    "id" UUID NOT NULL,
    "brandId" UUID,
    "rawPayload" JSONB NOT NULL,
    "eventType" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,

    CONSTRAINT "ZealyWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_privyId_key" ON "User"("privyId");

-- CreateIndex
CREATE INDEX "BrandMembership_brandId_idx" ON "BrandMembership"("brandId");

-- CreateIndex
CREATE INDEX "BrandMembership_userId_idx" ON "BrandMembership"("userId");

-- CreateIndex
CREATE INDEX "BrandMembership_wallet_idx" ON "BrandMembership"("wallet");

-- CreateIndex
CREATE UNIQUE INDEX "BrandMembership_brandId_wallet_tokenId_key" ON "BrandMembership"("brandId", "wallet", "tokenId");

-- CreateIndex
CREATE INDEX "Quest_brandId_idx" ON "Quest"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Quest_brandId_zealyQuestId_key" ON "Quest"("brandId", "zealyQuestId");

-- CreateIndex
CREATE INDEX "UserQuestState_brandId_questId_wallet_idx" ON "UserQuestState"("brandId", "questId", "wallet");

-- CreateIndex
CREATE UNIQUE INDEX "UserQuestState_brandId_questId_wallet_key" ON "UserQuestState"("brandId", "questId", "wallet");

-- CreateIndex
CREATE INDEX "Payment_brandId_idx" ON "Payment"("brandId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "ZealyWebhookLog_brandId_idx" ON "ZealyWebhookLog"("brandId");

-- CreateIndex
CREATE INDEX "ZealyWebhookLog_processed_idx" ON "ZealyWebhookLog"("processed");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandZealyConfig" ADD CONSTRAINT "BrandZealyConfig_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandMembership" ADD CONSTRAINT "BrandMembership_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandMembership" ADD CONSTRAINT "BrandMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuestState" ADD CONSTRAINT "UserQuestState_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuestState" ADD CONSTRAINT "UserQuestState_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuestState" ADD CONSTRAINT "UserQuestState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZealyWebhookLog" ADD CONSTRAINT "ZealyWebhookLog_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
