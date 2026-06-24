/**
 * Startup migration — runs idempotent CREATE TABLE IF NOT EXISTS for any tables
 * that Drizzle push may not have applied yet. Safe to run on every boot.
 * Non-fatal: if migration fails, server continues and routes handle errors gracefully.
 */

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

export async function runStartupMigrations(): Promise<void> {
  try {
    logger.info("Running startup migrations…");

    // ── Enums (idempotent via DO $$ blocks) ──────────────────────────────────

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE intel_signal_type AS ENUM (
          'regulatory_change','procurement_forecast','expiring_contract',
          'new_rulemaking','enforcement_action','budget_funding',
          'grant_program','industry_trend','state_procurement','other'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE intel_feedback AS ENUM ('saved','dismissed','new');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE intel_source AS ENUM (
          'federal_register','regulations_gov','sam_awards','usaspending',
          'dol_osha','acquisition_gov','ecfr','state_serper','state_portal','other'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE intel_scope AS ENUM ('federal','state');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── intel_feed_items ─────────────────────────────────────────────────────

    await db.execute(sql`
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
      )
    `);

    // ── intel_feed_signals ───────────────────────────────────────────────────

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS intel_feed_signals (
        id               TEXT PRIMARY KEY,
        signal_type      intel_signal_type NOT NULL,
        source           intel_source      NOT NULL,
        state_code       TEXT,
        saved_count      INTEGER           NOT NULL DEFAULT 0,
        dismissed_count  INTEGER           NOT NULL DEFAULT 0,
        total_count      INTEGER           NOT NULL DEFAULT 0,
        updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW()
      )
    `);

    // ── Indexes ───────────────────────────────────────────────────────────────

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_intel_feed_scope_state
        ON intel_feed_items (scope, state_code)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_intel_feed_signal_type
        ON intel_feed_items (signal_type)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_intel_feed_feedback
        ON intel_feed_items (feedback)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_intel_feed_published
        ON intel_feed_items (published_date DESC NULLS LAST)
    `);

    // ── source_monitor_items ─────────────────────────────────────────────────

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS source_monitor_items (
        id              TEXT PRIMARY KEY,
        source_id       TEXT NOT NULL,
        source_name     TEXT NOT NULL,
        category        TEXT NOT NULL,
        title           TEXT NOT NULL,
        summary         TEXT,
        item_url        TEXT,
        source_url      TEXT NOT NULL,
        published_date  TIMESTAMPTZ,
        scrape_status   TEXT NOT NULL DEFAULT 'success',
        error_message   TEXT,
        raw_json        TEXT,
        protected_from_cleanup BOOLEAN NOT NULL DEFAULT FALSE,
        protected_at    TIMESTAMPTZ,
        scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      ALTER TABLE source_monitor_items
      ADD COLUMN IF NOT EXISTS protected_from_cleanup BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await db.execute(sql`
      ALTER TABLE source_monitor_items
      ADD COLUMN IF NOT EXISTS protected_at TIMESTAMPTZ
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_source_monitor_items_source_id
        ON source_monitor_items (source_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_source_monitor_items_category
        ON source_monitor_items (category)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_source_monitor_items_scraped_at
        ON source_monitor_items (scraped_at DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_source_monitor_items_item_url
        ON source_monitor_items (item_url)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_source_monitor_items_cleanup_protected
        ON source_monitor_items (protected_from_cleanup)
    `);

    // ── source_monitor_runs ──────────────────────────────────────────────────

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS source_monitor_runs (
        id              TEXT PRIMARY KEY,
        source_id       TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'success',
        items_found     INTEGER NOT NULL DEFAULT 0,
        items_created   INTEGER NOT NULL DEFAULT 0,
        items_updated   INTEGER NOT NULL DEFAULT 0,
        error_message   TEXT,
        started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at    TIMESTAMPTZ
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_source_monitor_runs_source_id
        ON source_monitor_runs (source_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_source_monitor_runs_started_at
        ON source_monitor_runs (started_at DESC)
    `);

    logger.info("Startup migrations complete.");
  } catch (err) {
    // Non-fatal: log and continue. The server will still start.
    // Individual route handlers return 500 if tables are missing.
    logger.error({ err }, "Startup migration failed — server will continue");
  }
}
