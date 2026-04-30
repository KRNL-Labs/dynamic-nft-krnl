ALTER TABLE "Brand"
ADD COLUMN "krnlSenderAddress" TEXT,
ADD COLUMN "krnlDelegationTxHash" TEXT,
ADD COLUMN "krnlDelegationStatus" TEXT,
ADD COLUMN "krnlDelegationUpdatedAt" TIMESTAMP(3);
