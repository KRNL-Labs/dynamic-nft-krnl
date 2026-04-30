-- Add activeAssetPackId to BrandNftConfig
ALTER TABLE "BrandNftConfig" ADD COLUMN IF NOT EXISTS "activeAssetPackId" UUID;
