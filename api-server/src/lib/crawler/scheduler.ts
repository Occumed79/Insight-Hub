import {
  ActiveIngestionRunError,
  startManualIngestion,
  type ProviderFetcher,
} from "../ingestion/manualIngestion";
import { logger } from "../logger";
import {
  fetchDueCrawlerRecords,
  listDueCrawlerSourceIds,
} from "../providers/crawlerAugmentedPublicPortalProvider";

const DEFAULT_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_STARTUP_DELAY_MS = 30 * 1000;

let interval: ReturnType<typeof setInterval> | undefined;
let startupTimer: ReturnType<typeof setTimeout> | undefined;
let tickRunning = false;

function boundedNumberEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

export function isCrawlerSchedulerEnabled(): boolean {
  return process.env.PUBLIC_PORTAL_CRAWLER_SCHEDULER_ENABLED !== "false";
}

export function crawlerSchedulerIntervalMs(): number {
  return boundedNumberEnv(
    "PUBLIC_PORTAL_CRAWLER_SCHEDULER_INTERVAL_MS",
    DEFAULT_CHECK_INTERVAL_MS,
    5 * 60 * 1000,
    60 * 60 * 1000,
  );
}

function crawlerOnlyFetcher(): ProviderFetcher {
  return async (provider, options) => {
    if (provider !== "publicPortalProviders") {
      throw new Error(`Scheduled crawler cannot fetch provider ${provider}`);
    }
    return fetchDueCrawlerRecords({
      ...options,
      limit: 300,
    });
  };
}

export async function runCrawlerSchedulerTick(): Promise<{
  started: boolean;
  dueSourceIds: string[];
  runId?: string;
  reason?: string;
}> {
  if (!isCrawlerSchedulerEnabled()) {
    return { started: false, dueSourceIds: [], reason: "scheduler_disabled" };
  }
  if (tickRunning) {
    return { started: false, dueSourceIds: [], reason: "tick_already_running" };
  }

  tickRunning = true;
  try {
    const dueSourceIds = await listDueCrawlerSourceIds();
    if (dueSourceIds.length === 0) {
      return { started: false, dueSourceIds, reason: "no_due_sources" };
    }

    try {
      const run = await startManualIngestion(
        {
          providers: ["publicPortalProviders"],
          dateRange: 30,
        },
        crawlerOnlyFetcher(),
      );
      logger.info(
        { runId: run.id, dueSourceIds },
        "Scheduled crawler ingestion started",
      );
      return { started: true, dueSourceIds, runId: run.id };
    } catch (error) {
      if (error instanceof ActiveIngestionRunError) {
        logger.info(
          { activeRunId: error.runId, dueSourceIds },
          "Scheduled crawler deferred because an ingestion run is active",
        );
        return {
          started: false,
          dueSourceIds,
          reason: "ingestion_run_active",
        };
      }
      throw error;
    }
  } finally {
    tickRunning = false;
  }
}

export function startCrawlerScheduler(): void {
  if (!isCrawlerSchedulerEnabled() || interval || startupTimer) return;
  const intervalMs = crawlerSchedulerIntervalMs();
  const startupDelayMs = boundedNumberEnv(
    "PUBLIC_PORTAL_CRAWLER_SCHEDULER_STARTUP_DELAY_MS",
    DEFAULT_STARTUP_DELAY_MS,
    5_000,
    10 * 60 * 1000,
  );
  const runTick = () => {
    void runCrawlerSchedulerTick().catch((error) => {
      logger.error({ error }, "Scheduled crawler tick failed");
    });
  };

  startupTimer = setTimeout(() => {
    startupTimer = undefined;
    runTick();
    interval = setInterval(runTick, intervalMs);
    interval.unref?.();
  }, startupDelayMs);
  startupTimer.unref?.();

  logger.info(
    { intervalMs, startupDelayMs },
    "Scheduled crawler initialized",
  );
}

export function stopCrawlerScheduler(): void {
  if (startupTimer) clearTimeout(startupTimer);
  if (interval) clearInterval(interval);
  startupTimer = undefined;
  interval = undefined;
}
