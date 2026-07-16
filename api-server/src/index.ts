import app from "./app";
import { logger } from "./lib/logger";
import { runStartupMigrations } from "./lib/startup-migrate";
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

  // Run non-RFP startup migrations against the intel DB after server is up.
  // Non-fatal if they fail.
  runWithDbContext("intel", () => runStartupMigrations()).catch((err) => {
    logger.error({ err }, "Unexpected error in startup migrations");
  });
});
