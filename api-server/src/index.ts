import app from "./app";
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
        logger.info({ port, databases: getDatabaseConfigSummary() }, "Server listening");
        resolve();
      }
    });
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Bootstrap failed — exiting");
  process.exitCode = 1;
  process.exit(1);
});
