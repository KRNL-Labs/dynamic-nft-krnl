-- Track KRNL executor bootstrap status
CREATE TABLE IF NOT EXISTS "KrnlExecutorBootstrap" (
    "id" UUID NOT NULL,
    "chainId" INTEGER NOT NULL,
    "senderAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "txHash" TEXT,
    "errorMessage" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KrnlExecutorBootstrap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KrnlExecutorBootstrap_chainId_senderAddress_key"
ON "KrnlExecutorBootstrap"("chainId", "senderAddress");

CREATE INDEX IF NOT EXISTS "KrnlExecutorBootstrap_senderAddress_idx"
ON "KrnlExecutorBootstrap"("senderAddress");
