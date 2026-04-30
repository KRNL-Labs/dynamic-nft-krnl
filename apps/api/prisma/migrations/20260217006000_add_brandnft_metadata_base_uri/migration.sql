-- Add metadataBaseURI to BrandNftConfig
ALTER TABLE "BrandNftConfig" ADD COLUMN IF NOT EXISTS "metadataBaseURI" TEXT;
