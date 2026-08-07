import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.RFP_DATABASE_URL ??=
  "postgresql://test:test@127.0.0.1:5432/rfp_core";
delete process.env.INTEL_DATABASE_URL;

const dbModule = await import("@workspace/db");

test("Hub 1 database module loads without INTEL_DATABASE_URL", async () => {
  assert.equal(dbModule.isIntelDatabaseConfigured(), false);
  const summary = dbModule.getDatabaseConfigSummary();
  assert.equal(summary.rfp.configured, true);
  assert.equal(summary.intel.configured, false);
  assert.equal(summary.intel.owner, "Insight-Hub2.0");

  await assert.rejects(
    () => dbModule.intelPool.query("select 1"),
    /owned by Insight Hub 2/,
  );
});

test("procurement bootstrap and readiness do not depend on Intel DB", async () => {
  const [bootstrap, readiness, status] = await Promise.all([
    readFile("src/index.ts", "utf8"),
    readFile("src/lib/runtimeHealth.ts", "utf8"),
    readFile("src/routes/database-status.ts", "utf8"),
  ]);

  assert.equal(bootstrap.includes("runStartupMigrations"), false);
  assert.equal(bootstrap.includes("verifyDatabaseRouting"), false);
  assert.equal(bootstrap.includes("runWithDbContext(\"intel\""), false);
  assert.equal(readiness.includes("probePool(intelPool"), false);
  assert.match(readiness, /owner: "Insight-Hub2\.0"/);
  assert.equal(status.includes("intelPool.query"), false);
  assert.match(status, /requiredForReadiness: false/);
});

test.after(async () => {
  await dbModule.rfpPool.end();
});
