-- Create BrandTokenAllocation table
CREATE TABLE IF NOT EXISTS "BrandTokenAllocation" (
  "id" UUID NOT NULL,
  "brandId" UUID NOT NULL,
  "startTokenId" INTEGER NOT NULL,
  "endTokenId" INTEGER NOT NULL,
  "nextTokenId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandTokenAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrandTokenAllocation_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BrandTokenAllocation_brandId_idx" ON "BrandTokenAllocation"("brandId");
CREATE INDEX IF NOT EXISTS "BrandTokenAllocation_startTokenId_idx" ON "BrandTokenAllocation"("startTokenId");
CREATE INDEX IF NOT EXISTS "BrandTokenAllocation_endTokenId_idx" ON "BrandTokenAllocation"("endTokenId");
