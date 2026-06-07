/**
 * Scheduled Background Ingestion
 *
 * Periodically runs the unified fetch pipeline so the opportunities DB stays
 * continuously deep instead of depending on someone clicking "Fetch". The list
 * then loads instantly from already-ingested, scored, deduped records.
 *
 * Opt-in and safe by default:
 *   - Disabled unless ENABLE_SCHEDULED_INGESTION=true (prevents surprise quota burn).
 *   - Interval and provider set are env-configurable.
 *   - Runs never overlap (a run in progress skips the next tick).
 *   - The timer is unref()'d so it never keeps the process alive on its own.
 *   - Failures are logged and swallowed — a bad run never crashes the server.
 *
 * Env vars (all optional):
 *   ENABLE_SCHEDULED_INGESTION   "true" to turn it on (default off)
 *   INGESTION_INTERVAL_MINUTES   minutes between runs (default 360 = 6h, min 15)
 *   INGESTION_PROVIDERS          comma-separated provider keys (default: free + default web)
 *   INGESTION_DATE_RANGE_DAYS    look-back window passed to providers (default 30)
 */

import { logger } from "../logger";
import { unifiedFetch } from "./unifiedSearch";

// Free (no-key) sources plus the default web providers. Kept conservative so an
// unattended job doesn't hammer paid/keyed providers; override via INGESTION_PROVIDERS.
const DEFAULT_INGESTION_PROVIDERS = ["samGov", "grantsGov", "usaSpending", "statePortals", "serper", "tavily"];

const DEFAULT_INTERVAL_MINUTES = 360;
const MIN_INTERVAL_MINUTES = 15;
const DEFAULT_DATE_RANGE_DAYS = 30;
const INITIAL_DELAY_MS = 60_000; // let the server settle / migrations run first

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

function parseProviders(): string[] {
  const raw = process.env["INGESTION_PROVIDERS"];
  if (!raw?.trim()) return DEFAULT_INGESTION_PROVIDERS;
  const parsed = raw.split(",").map((p) => p.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_INGESTION_PROVIDERS;
}

function parseIntervalMinutes(): number {
  const raw = Number(process.env["INGESTION_INTERVAL_MINUTES"]);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_INTERVAL_MINUTES;
  return Math.max(MIN_INTERVAL_MINUTES, Math.floor(raw));
}

function parseDateRange(): number {
  const raw = Number(process.env["INGESTION_DATE_RANGE_DAYS"]);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DATE_RANGE_DAYS;
  return Math.floor(raw);
}

/**
 * Run one ingestion cycle. Exported for manual/testing use. Never throws.
 */
export async function runIngestionCycle(): Promise<void> {
  if (running) {
    logger.info("Scheduled ingestion already running — skipping this tick");
    return;
  }
  running = true;
  const providers = parseProviders();
  const dateRange = parseDateRange();
  const startedAt = Date.now();
  try {
    logger.info({ providers, dateRange }, "Scheduled ingestion: starting cycle");
    const result = await unifiedFetch({ providers, dateRange });
    logger.info(
      {
        fetched: result.fetched,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        durationMs: Date.now() - startedAt,
      },
      "Scheduled ingestion: cycle complete"
    );
  } catch (err) {
    logger.error({ err }, "Scheduled ingestion: cycle failed");
  } finally {
    running = false;
  }
}

/**
 * Start the background scheduler if enabled via env. Idempotent.
 */
export function startScheduledIngestion(): void {
  if (process.env["ENABLE_SCHEDULED_INGESTION"] !== "true") {
    logger.info("Scheduled ingestion disabled (set ENABLE_SCHEDULED_INGESTION=true to enable)");
    return;
  }
  if (timer) return;

  const intervalMs = parseIntervalMinutes() * 60_000;
  logger.info({ intervalMinutes: intervalMs / 60_000 }, "Scheduled ingestion enabled");

  // Kick off an initial run shortly after boot, then on the fixed interval.
  const initial = setTimeout(() => void runIngestionCycle(), INITIAL_DELAY_MS);
  if (typeof initial.unref === "function") initial.unref();

  timer = setInterval(() => void runIngestionCycle(), intervalMs);
  if (typeof timer.unref === "function") timer.unref();
}

/**
 * Stop the scheduler (testing / graceful shutdown).
 */
export function stopScheduledIngestion(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
