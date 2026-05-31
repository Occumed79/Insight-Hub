/**
 * Startup migration — runs idempotent CREATE TABLE IF NOT EXISTS for any tables
 * that Drizzle push may not have applied yet. Safe to run on every boot.
 */

import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function runStartupMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    logger.info("Running startup migrations…");

    // ── Enums (CREATE TYPE IF NOT EXISTS not supported in older PG — use DO blocks) ──

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE intel_signal_type AS ENUM (
          'regulatory_change','procurement_forecast','expiring_contract',
          'new_rulemaking','enforcement_action','budget_funding',
          'grant_program','industry_trend','state_procurement','other'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE intel_feedback AS ENUM ('saved','dismissed','new');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE intel_source AS ENUM (
          'federal_register','regulations_gov','sam_awards','usaspending',
          'dol_osha','acquisition_gov','ecfr','state_serper','state_portal','other'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE intel_scope AS ENUM ('federal','state');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ── intel_feed_items ─────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS intel_feed_items (
        id              TEXT PRIMARY KEY,
        scope           intel_scope        NOT NULL DEFAULT 'federal',
        state_code      TEXT,
        signal_type     intel_signal_type  NOT NULL DEFAULT 'other',
        source          intel_source       NOT NULL DEFAULT 'other',
        agency          TEXT,
        title           TEXT NOT NULL,
        summary         TEXT,
        source_url      TEXT,
        published_date  TIMESTAMPTZ,
        feedback        intel_feedback     NOT NULL DEFAULT 'new',
        relevance_score INTEGER            DEFAULT 50,
        external_id     TEXT,
        raw_json        TEXT,
        fetched_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
        created_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW()
      );
    `);

    // ── intel_feed_signals ───────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS intel_feed_signals (
        id               TEXT PRIMARY KEY,
        signal_type      intel_signal_type NOT NULL,
        source           intel_source      NOT NULL,
        state_code       TEXT,
        saved_count      INTEGER           NOT NULL DEFAULT 0,
        dismissed_count  INTEGER           NOT NULL DEFAULT 0,
        total_count      INTEGER           NOT NULL DEFAULT 0,
        updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW()
      );
    `);

    // ── Indexes ───────────────────────────────────────────────────────────────

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_feed_scope_state
        ON intel_feed_items (scope, state_code);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_feed_signal_type
        ON intel_feed_items (signal_type);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_feed_feedback
        ON intel_feed_items (feedback);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_feed_published
        ON intel_feed_items (published_date DESC NULLS LAST);
    `);

    logger.info("Startup migrations complete.");
  } catch (err) {
    logger.error({ err }, "Startup migration failed — continuing anyway");
  } finally {
    client.release();
  }
}
