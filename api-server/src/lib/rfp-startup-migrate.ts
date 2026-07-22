// Startup migration — idempotent database setup for the RFP opportunities database.

import { sql } from "drizzle-orm";
import { rfpDb as db } from "@workspace/db";
import { logger } from "./logger";

export async function runRfpStartupMigrations(): Promise<void> {
  logger.info("[rfp] Running RFP startup migrations…");

  try {

    // 1. Add the provider identity column if it is not already present.
    await db.execute(sql`
      ALTER TABLE opportunities
        ADD COLUMN IF NOT EXISTS provider_key text
    `);

    // 2. Backfill canonical provider identities without changing any primary ID
    // or user-controlled field. The retired statePortals name is the legacy
    // alias for publicPortalProviders, not a CSV-import provider.
    await db.execute(sql`
      UPDATE opportunities
      SET provider_key = CASE
        WHEN provider_name IN (
          'samGov','publicPortalProviders','eunaBonfire','internationalPublicPortals',
          'tango','bidnet','serper','tavily','exa','gemini',
          'texasEsbd','nyScr','csvImport','manual'
        ) THEN provider_name
        WHEN provider_name = 'statePortals' THEN 'publicPortalProviders'
        WHEN source = 'sam_gov' THEN 'samGov'
        WHEN source = 'csv_import' AND lower(coalesce(provider_name,'')) LIKE '%texas%' THEN 'texasEsbd'
        WHEN source = 'csv_import' AND lower(coalesce(provider_name,'')) LIKE '%nyscr%' THEN 'nyScr'
        WHEN source = 'csv_import' AND lower(coalesce(provider_name,'')) LIKE '%new york%' THEN 'nyScr'
        WHEN source = 'csv_import' THEN 'csvImport'
        ELSE 'manual'
      END
      WHERE provider_key IS NULL
    `);

    // 3. Keep historical duplicate rows intact. For duplicate legacy pairs,
    // retain the canonical provider_key on the earliest row and leave the new
    // provider_key null on the additional rows so the partial unique index can
    // be created without deleting or merging any record.
    await db.execute(sql`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY provider_key, notice_id
            ORDER BY created_at ASC, id ASC
          ) AS duplicate_rank
        FROM opportunities
        WHERE provider_key IS NOT NULL AND notice_id IS NOT NULL
      )
      UPDATE opportunities AS opportunity
      SET provider_key = NULL
      FROM ranked
      WHERE opportunity.id = ranked.id
        AND ranked.duplicate_rank > 1
    `);

    // 4. Remove the old global external-ID constraint.
    await db.execute(sql`
      ALTER TABLE opportunities
        DROP CONSTRAINT IF EXISTS opportunities_notice_id_unique
    `);

    // 5. Enforce provider-scoped identity for all newly normalized records.
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunities_provider_notice
        ON opportunities (provider_key, notice_id)
        WHERE provider_key IS NOT NULL AND notice_id IS NOT NULL
    `);

    // 6. Index feedback lookups and enforce that all new/updated feedback points
    // to a real opportunity. NOT VALID preserves any historical orphan rows.
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_opportunity_feedback_opportunity_id
        ON opportunity_feedback (opportunity_id)
    `);

    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'opportunity_feedback_opportunity_id_fkey'
        ) THEN
          ALTER TABLE opportunity_feedback
            ADD CONSTRAINT opportunity_feedback_opportunity_id_fkey
            FOREIGN KEY (opportunity_id)
            REFERENCES opportunities (id)
            ON DELETE CASCADE
            NOT VALID;
        END IF;
      END $$
    `);

    // Validate only when the existing data is already clean. The constraint
    // still protects all new and updated rows while legacy orphans are reviewed.
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM opportunity_feedback feedback
          LEFT JOIN opportunities opportunity
            ON opportunity.id = feedback.opportunity_id
          WHERE opportunity.id IS NULL
        ) THEN
          ALTER TABLE opportunity_feedback
            VALIDATE CONSTRAINT opportunity_feedback_opportunity_id_fkey;
        END IF;
      END $$
    `);

    // 7. Persist keyword-training text on opportunity_feedback so the learning
    // model can extract title/description keywords without re-fetching the
    // opportunity table at scoring time.
    await db.execute(sql`
      ALTER TABLE opportunity_feedback
        ADD COLUMN IF NOT EXISTS title text
    `);

    await db.execute(sql`
      ALTER TABLE opportunity_feedback
        ADD COLUMN IF NOT EXISTS description text
    `);

    // 8. Backfill title and description from the matched opportunity row for
    // every feedback record that does not yet have them. Only rows where the
    // opportunity still exists are updated; orphan feedback rows are left as-is
    // (both new columns remain NULL there, which is safe).
    await db.execute(sql`
      UPDATE opportunity_feedback AS feedback
      SET
        title       = opportunity.title,
        description = opportunity.description
      FROM opportunities AS opportunity
      WHERE opportunity.id = feedback.opportunity_id
        AND (feedback.title IS NULL OR feedback.description IS NULL)
    `);



    // 9. Keep manual ingestion runs durable and cancellable in production.
    await db.execute(sql`ALTER TYPE opportunity_ingestion_run_status ADD VALUE IF NOT EXISTS 'cancelled'`);
    await db.execute(sql`ALTER TYPE opportunity_ingestion_source_status ADD VALUE IF NOT EXISTS 'timed_out'`);
    await db.execute(sql`ALTER TYPE opportunity_ingestion_source_status ADD VALUE IF NOT EXISTS 'cancelled'`);
    await db.execute(sql`
      ALTER TABLE opportunity_ingestion_runs
        ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
        ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
        ADD COLUMN IF NOT EXISTS status_message text,
        ADD COLUMN IF NOT EXISTS providers_failed integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS providers_timed_out integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS providers_skipped integer NOT NULL DEFAULT 0
    `);
    await db.execute(sql`
      ALTER TABLE opportunity_ingestion_run_sources
        ADD COLUMN IF NOT EXISTS elapsed_ms integer
    `);
    await db.execute(sql`
      UPDATE opportunity_ingestion_runs
      SET heartbeat_at = updated_at
      WHERE heartbeat_at IS NULL
    `);

    logger.info("[rfp] RFP startup migrations complete.");
  } catch (err) {
    logger.error({ err, db: "rfp" }, "[rfp] RFP startup migration failed");
    throw err;
  }
}
