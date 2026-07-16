-- Migration 0003: provider-scoped opportunity identity
--
-- Goals
--   1. Add provider_key column (nullable text) to opportunities.
--   2. Backfill provider_key from provider_name / source for existing rows.
--   3. Preserve historical duplicate rows without blocking the new index.
--   4. Remove the old global unique constraint on notice_id.
--   5. Create a partial composite unique index on (provider_key, notice_id)
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
UPDATE "opportunities"
SET "provider_key" = CASE
  WHEN "provider_name" IN (
    'samGov','publicPortalProviders','eunaBonfire','internationalPublicPortals',
    'tango','bidnet','serper','tavily','exa','gemini',
    'texasEsbd','nyScr','csvImport','manual'
  ) THEN "provider_name"
  WHEN "provider_name" = 'statePortals' THEN 'publicPortalProviders'
  WHEN "source" = 'sam_gov' THEN 'samGov'
  WHEN "source" = 'csv_import' AND lower(coalesce("provider_name",'')) LIKE '%texas%' THEN 'texasEsbd'
  WHEN "source" = 'csv_import' AND lower(coalesce("provider_name",'')) LIKE '%nyscr%' THEN 'nyScr'
  WHEN "source" = 'csv_import' AND lower(coalesce("provider_name",'')) LIKE '%new york%' THEN 'nyScr'
  WHEN "source" = 'csv_import' THEN 'csvImport'
  ELSE 'manual'
END
WHERE "provider_key" IS NULL;--> statement-breakpoint

-- 3. Preserve duplicate historical rows. Keep the canonical provider_key on
--    the earliest row and leave provider_key null on additional legacy rows so
--    the partial unique index can be created without deleting or merging data.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "provider_key", "notice_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS duplicate_rank
  FROM "opportunities"
  WHERE "provider_key" IS NOT NULL AND "notice_id" IS NOT NULL
)
UPDATE "opportunities" AS opportunity
SET "provider_key" = NULL
FROM ranked
WHERE opportunity."id" = ranked."id"
  AND ranked.duplicate_rank > 1;--> statement-breakpoint

-- 4. Drop the old global unique constraint on notice_id if it still exists.
ALTER TABLE "opportunities"
  DROP CONSTRAINT IF EXISTS "opportunities_notice_id_unique";--> statement-breakpoint

-- 5. Create the provider-scoped partial unique index (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_opportunities_provider_notice"
  ON "opportunities" ("provider_key", "notice_id")
  WHERE "provider_key" IS NOT NULL AND "notice_id" IS NOT NULL;
