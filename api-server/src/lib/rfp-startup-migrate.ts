// Startup migration — idempotent database setup for the RFP opportunities database.

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

export async function runRfpStartupMigrations(): Promise<void> {
  try {
    logger.info("Running RFP startup migrations…");

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

    logger.info("RFP startup migrations complete.");
  } catch (err) {
    logger.error({ err }, "RFP startup migration failed — server will continue");
  }
}
