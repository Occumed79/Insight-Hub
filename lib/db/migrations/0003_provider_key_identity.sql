-- Migration 0003: provider-scoped opportunity identity
--
-- Goals
--   1. Add provider_key column (nullable text) to opportunities.
--   2. Backfill provider_key from provider_name / source for existing rows.
--   3. Remove the old global unique constraint on notice_id.
--   4. Create a partial composite unique index on (provider_key, notice_id)
--      that only enforces uniqueness when both columns are non-null.
--
-- This migration is intentionally non-destructive:
--   - No rows are deleted or merged.
--   - Primary keys, feedback records, userGrade, userConfidence, notes, and
--     all other user-controlled values are untouched.
--   - All DDL statements use IF NOT EXISTS / IF EXISTS guards so the
--     migration is safe to replay.

-- 1. Add provider_key column (idempotent).
ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "provider_key" text;--> statement-breakpoint

-- 2. Backfill provider_key for existing rows.
--    Priority order:
--      a. Rows whose provider_name already matches a canonical key → use it.
--      b. Rows with source = 'sam_gov'   → 'samGov'
--      c. Rows with source = 'csv_import' whose provider_name contains a hint:
--           texasEsbd / texas → 'texasEsbd'
--           nyScr / new york  → 'nyScr'
--           otherwise         → 'csvImport'
--      d. Everything else     → 'manual'
UPDATE "opportunities"
SET "provider_key" = CASE
  -- Exact canonical key already stored in provider_name
  WHEN "provider_name" IN (
    'samGov','publicPortalProviders','eunaBonfire','internationalPublicPortals',
    'tango','bidnet','serper','tavily','exa','gemini',
    'texasEsbd','nyScr','csvImport','manual'
  ) THEN "provider_name"
  -- source-enum → canonical key
  WHEN "source" = 'sam_gov'    THEN 'samGov'
  WHEN "source" = 'csv_import' AND lower(coalesce("provider_name",'')) LIKE '%texas%'    THEN 'texasEsbd'
  WHEN "source" = 'csv_import' AND lower(coalesce("provider_name",'')) LIKE '%nyscr%'    THEN 'nyScr'
  WHEN "source" = 'csv_import' AND lower(coalesce("provider_name",'')) LIKE '%new york%' THEN 'nyScr'
  WHEN "source" = 'csv_import' THEN 'csvImport'
  ELSE 'manual'
END
WHERE "provider_key" IS NULL;--> statement-breakpoint

-- 3. Drop the old global unique constraint on notice_id (if it still exists).
--    The constraint name used by Drizzle's initial migration is
--    "opportunities_notice_id_unique".  We guard with DO $$ to avoid an error
--    if it was already removed on a database that already ran this migration.
DO $$ BEGIN
  ALTER TABLE "opportunities"
    DROP CONSTRAINT IF EXISTS "opportunities_notice_id_unique";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;--> statement-breakpoint

-- 4. Create the provider-scoped partial unique index (idempotent).
--    Only enforced when BOTH provider_key and notice_id are non-null,
--    so legacy rows with either column null are never blocked.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_opportunities_provider_notice"
  ON "opportunities" ("provider_key", "notice_id")
  WHERE "provider_key" IS NOT NULL AND "notice_id" IS NOT NULL;
