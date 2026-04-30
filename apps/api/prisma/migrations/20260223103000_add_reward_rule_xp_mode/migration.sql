ALTER TABLE "BrandRewardRule"
  ADD COLUMN IF NOT EXISTS "xpMode" TEXT NOT NULL DEFAULT 'ZEALY',
  ADD COLUMN IF NOT EXISTS "xpOverride" INT;

UPDATE "BrandRewardRule"
SET "xpMode" = 'ZEALY'
WHERE "xpMode" IS NULL OR "xpMode" = '';
