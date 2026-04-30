DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'PortalSession_privyUserId_walletAddress_key'
  ) THEN
    EXECUTE 'DROP INDEX "PortalSession_privyUserId_walletAddress_key"';
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'PortalSession_privyUserId_key'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX "PortalSession_privyUserId_key" ON "PortalSession"("privyUserId")';
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;
