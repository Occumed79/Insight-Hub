import type { Server } from "node:http";
import app from "./app";
import { isTransientDatabaseError } from "./lib/databaseReliability";
import { logger } from "./lib/logger";
import { markRuntimeReady, markRuntimeShuttingDown } from "./lib/runtimeHealth";
import { runRfpStartupMigrations } from "./lib/rfp-startup-migrate";
import {
  getDatabaseConfigSummary,
  rfpPool,
  verifyRfpDatabase,
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

function boundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

const DATABASE_VALIDATION_TIMEOUT_MS = 30_000;
const MIGRATION_TIMEOUT_MS = 120_000;
const SHUTDOWN_TIMEOUT_MS = 15_000;
const HTTP_REQUEST_TIMEOUT_MS = boundedIntegerEnv(
  "HTTP_REQUEST_TIMEOUT_MS",
  120_000,
  15_000,
  1_200_000,
);
const HTTP_HEADERS_TIMEOUT_MS = boundedIntegerEnv(
  "HTTP_HEADERS_TIMEOUT_MS",
  15_000,
  5_000,
  60_000,
);
const HTTP_KEEP_ALIVE_TIMEOUT_MS = boundedIntegerEnv(
  "HTTP_KEEP_ALIVE_TIMEOUT_MS",
  5_000,
  1_000,
  30_000,
);
let server: Server | undefined;
let shuttingDown = false;

async function withDeadline<T>(
  label: string,
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operationPromise = operation();
  operationPromise.catch(() => undefined);
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([operationPromise, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function configureHttpServer(activeServer: Server): void {
  activeServer.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;
  activeServer.headersTimeout = Math.min(
    HTTP_HEADERS_TIMEOUT_MS,
    HTTP_REQUEST_TIMEOUT_MS,
  );
  activeServer.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;
  activeServer.maxHeadersCount = 100;
  activeServer.maxRequestsPerSocket = 100;
  activeServer.setTimeout(HTTP_REQUEST_TIMEOUT_MS);
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
  markRuntimeShuttingDown();
  logger.info({ signal }, "Graceful shutdown started");

  const forceExit = setTimeout(() => {
    logger.error({ signal }, "Graceful shutdown deadline exceeded");
    server?.closeAllConnections?.();
    process.exit(exitCode || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref?.();

  try {
    await closeHttpServer();
    await rfpPool.end();
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
  const routing = await withDeadline(
    "RFP database validation",
    () => verifyRfpDatabase(),
    DATABASE_VALIDATION_TIMEOUT_MS,
  );
  logger.info(routing, "Procurement database verified");

  await withDeadline(
    "RFP database migrations",
    () => runRfpStartupMigrations(),
    MIGRATION_TIMEOUT_MS,
  );

  server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(port);
    listener.once("listening", () => resolve(listener));
    listener.once("error", reject);
  });
  configureHttpServer(server);
  markRuntimeReady();

  logger.info(
    {
      port,
      databases: getDatabaseConfigSummary(),
      http: {
        requestTimeoutMs: HTTP_REQUEST_TIMEOUT_MS,
        headersTimeoutMs: HTTP_HEADERS_TIMEOUT_MS,
        keepAliveTimeoutMs: HTTP_KEEP_ALIVE_TIMEOUT_MS,
      },
    },
    "Server listening",
  );

  logger.info("Automatic crawler scheduler disabled; ingestion is manual-only");
}

bootstrap().catch((error) => {
  logger.fatal({ error }, "Bootstrap failed");
  void shutdown("bootstrap", 1);
});
