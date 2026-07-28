import type { Server } from "node:http";
import app from "./app";
import { startCrawlerScheduler } from "./lib/crawler/scheduler";
import { logger } from "./lib/logger";
import { runStartupMigrations } from "./lib/startup-migrate";
import { runRfpStartupMigrations } from "./lib/rfp-startup-migrate";
import { getDatabaseConfigSummary, runWithDbContext } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const MIGRATION_TIMEOUT_MS = 120_000;
const SHUTDOWN_TIMEOUT_MS = 15_000;
let server: Server | undefined;
let shuttingDown = false;

async function withDeadline<T>(
  label: string,
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([operation(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

  const forceExit = setTimeout(() => {
    logger.error({ signal }, "Graceful shutdown deadline exceeded");
    process.exit(exitCode || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  if (!server) {
    clearTimeout(forceExit);
    process.exit(exitCode);
    return;
  }

  server.close((error) => {
    clearTimeout(forceExit);
    if (error) {
      logger.error({ error, signal }, "HTTP server close failed");
      process.exit(1);
      return;
    }
    logger.info({ signal }, "Graceful shutdown complete");
    process.exit(exitCode);
  });
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught exception");
  void shutdown("uncaughtException", 1);
});

async function bootstrap(): Promise<void> {
  // Keep migration-before-traffic ordering, but put a finite ceiling around
  // each database so a stalled connection fails clearly instead of hanging the
  // service startup indefinitely.
  await withDeadline(
    "Intel database migrations",
    () => runWithDbContext("intel", () => runStartupMigrations()),
    MIGRATION_TIMEOUT_MS,
  );
  await withDeadline(
    "RFP database migrations",
    () => runWithDbContext("rfp", () => runRfpStartupMigrations()),
    MIGRATION_TIMEOUT_MS,
  );

  server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(port, () => resolve(listener));
    listener.once("error", reject);
  });

  logger.info(
    { port, databases: getDatabaseConfigSummary() },
    "Server listening",
  );

  // The scheduler uses the same durable ingestion pipeline and starts only
  // after migrations and the HTTP listener are healthy.
  try {
    startCrawlerScheduler();
  } catch (error) {
    // Scheduler startup must never take down the user-facing server. The error
    // remains visible in logs and a later deploy/restart can retry it.
    logger.error({ error }, "Crawler scheduler failed to start");
  }
}

bootstrap().catch((error) => {
  logger.fatal({ error }, "Bootstrap failed");
  void shutdown("bootstrap", 1);
});
