DO $$ BEGIN
  CREATE TYPE "PortalType" AS ENUM ('BRAND', 'OWNER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PortalSession" (
  "id" UUID NOT NULL,
  "privyUserId" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "portalType" "PortalType" NOT NULL,
  "brandId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PortalSession_privyUserId_walletAddress_key"
  ON "PortalSession"("privyUserId", "walletAddress");

CREATE INDEX IF NOT EXISTS "PortalSession_privyUserId_idx" ON "PortalSession"("privyUserId");
CREATE INDEX IF NOT EXISTS "PortalSession_walletAddress_idx" ON "PortalSession"("walletAddress");
CREATE INDEX IF NOT EXISTS "PortalSession_brandId_idx" ON "PortalSession"("brandId");

ALTER TABLE "PortalSession"
  ADD CONSTRAINT "PortalSession_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
