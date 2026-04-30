DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Brand_ownerUserId_fkey'
      AND table_name = 'Brand'
  ) THEN
    EXECUTE 'ALTER TABLE "Brand" DROP CONSTRAINT "Brand_ownerUserId_fkey"';
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE "Brand"
  ALTER COLUMN "ownerUserId" TYPE TEXT USING "ownerUserId"::text;

UPDATE "Brand" b
SET "ownerUserId" = u."privyId"
FROM "User" u
WHERE b."ownerUserId"::uuid = u."id";

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Brand_ownerUserId_fkey'
      AND table_name = 'Brand'
  ) THEN
    EXECUTE 'ALTER TABLE "Brand" ADD CONSTRAINT "Brand_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("privyId") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;
