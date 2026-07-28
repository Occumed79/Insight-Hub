import app from "./app";
import { startCrawlerScheduler } from "./lib/crawler/scheduler";
import { isTransientDatabaseError } from "./lib/databaseReliability";
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

// Final containment for a transient Neon failure that escapes a background
// task. Known database connectivity failures are logged without killing every
// API route. Non-database unhandled rejections still terminate the process so
// programming defects are not silently hidden.
process.on("unhandledRejection", (reason) => {
  if (isTransientDatabaseError(reason)) {
    logger.error(
      { reason },
      "Transient database rejection escaped a background task; service kept alive",
    );
    return;
  }

  logger.fatal({ reason }, "Unhandled promise rejection — exiting");
  process.exitCode = 1;
  setImmediate(() => process.exit(1));
});

async function bootstrap(): Promise<void> {
  // Run both migration paths sequentially, each scoped to its own database
  // context. If either fails the error propagates here and the HTTP listener
  // is never started.
  await runWithDbContext("intel", () => runStartupMigrations());
  await runWithDbContext("rfp", () => runRfpStartupMigrations());

  // Only start accepting traffic after all migrations have completed.
  await new Promise<void>((resolve, reject) => {
    app.listen(port, (err) => {
      if (err) {
        reject(err);
      } else {
        logger.info(
          { port, databases: getDatabaseConfigSummary() },
          "Server listening",
        );
        resolve();
      }
    });
  });

  // The scheduler uses the same durable ingestion pipeline and starts only
  // after migrations and the HTTP listener are healthy.
  startCrawlerScheduler();
}

bootstrap().catch((err) => {
  logger.error({ err }, "Bootstrap failed — exiting");
  process.exitCode = 1;
  process.exit(1);
});
