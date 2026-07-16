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

// Start server first, then run migrations in background (non-blocking)
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port, databases: getDatabaseConfigSummary() }, "Server listening");

  // Keep migrations explicitly scoped to their own Neon databases.
  // Both migration paths are non-fatal if they fail.
  runWithDbContext("intel", () => runStartupMigrations()).catch((err) => {
    logger.error({ err }, "Unexpected error in intelligence startup migrations");
  });

  runWithDbContext("rfp", () => runRfpStartupMigrations()).catch((err) => {
    logger.error({ err }, "Unexpected error in RFP startup migrations");
  });
});
