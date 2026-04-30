-- Create Token table
CREATE TABLE IF NOT EXISTS "Token" (
  "id" UUID NOT NULL,
  "tokenId" TEXT NOT NULL,
  "brandId" UUID NOT NULL,
  "ownerAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Token_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Token_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Token_tokenId_key" ON "Token"("tokenId");
CREATE INDEX IF NOT EXISTS "Token_brandId_idx" ON "Token"("brandId");
