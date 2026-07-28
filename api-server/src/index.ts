import type { Server } from "node:http";
import app from "./app";
import { isTransientDatabaseError } from "./lib/databaseReliability";
import { logger } from "./lib/logger";
import { runStartupMigrations } from "./lib/startup-migrate";
import { runRfpStartupMigrations } from "./lib/rfp-startup-migrate";
import {
  getDatabaseConfigSummary,
  intelPool,
  rfpPool,
  runWithDbContext,
} from "@workspace/db";

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
    timer.unref?.();
  });
  try {
    return await Promise.race([operation(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function closeHttpServer(): Promise<void> {
  if (!server) return;
  const activeServer = server;
  server = undefined;
  activeServer.closeIdleConnections?.();
  await new Promise<void>((resolve, reject) => {
    activeServer.close((error) => (error ? reject(error) : resolve()));
  });
}

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

  const forceExit = setTimeout(() => {
    logger.error({ signal }, "Graceful shutdown deadline exceeded");
    process.exit(exitCode || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref?.();

  try {
    await closeHttpServer();
    const poolResults = await Promise.allSettled([rfpPool.end(), intelPool.end()]);
    for (const [index, result] of poolResults.entries()) {
      if (result.status === "rejected") {
        logger.error(
          {
            error: result.reason,
            logicalDatabase: index === 0 ? "rfp" : "intel",
          },
          "Database pool shutdown failed",
        );
      }
    }
    logger.info({ signal }, "Graceful shutdown complete");
  } catch (error) {
    logger.error({ error, signal }, "Graceful shutdown failed");
    exitCode = 1;
  } finally {
    clearTimeout(forceExit);
    process.exit(exitCode);
  }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

// Final containment for a transient Neon failure that escapes a background
// task. Known database connectivity failures are logged without killing every
// API route. Non-database unhandled rejections still trigger graceful shutdown
// so programming defects are not silently hidden.
process.on("unhandledRejection", (reason) => {
  if (isTransientDatabaseError(reason)) {
    logger.error(
      { reason },
      "Transient database rejection escaped a background task; service kept alive",
    );
    return;
  }

  logger.fatal({ reason }, "Unhandled promise rejection");
  void shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught exception");
  void shutdown("uncaughtException", 1);
});

async function bootstrap(): Promise<void> {
  // Preserve migration-before-traffic ordering while preventing a stalled Neon
  // connection from leaving Render in an indefinite startup state.
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
    const listener = app.listen(port);
    listener.once("listening", () => resolve(listener));
    listener.once("error", reject);
  });

  logger.info(
    { port, databases: getDatabaseConfigSummary() },
    "Server listening",
  );

  // Production is intentionally manual-ingestion-only. The crawler scheduler
  // remains available to explicit administrative callers, but it is never
  // started automatically during service bootstrap.
  logger.info("Automatic crawler scheduler disabled; ingestion is manual-only");
}

bootstrap().catch((error) => {
  logger.fatal({ error }, "Bootstrap failed");
  void shutdown("bootstrap", 1);
});
