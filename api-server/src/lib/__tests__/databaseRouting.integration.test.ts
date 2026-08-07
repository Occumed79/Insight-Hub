import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??=
  "postgresql://test:test@127.0.0.1:5432/rfp_core";
process.env.INTEL_DATABASE_URL ??=
  "postgresql://test:test@127.0.0.1:5432/intel";

const { rfpPool, intelPool, verifyDatabaseRouting } = await import("@workspace/db");

test("RFP and Intel logical databases are isolated and pass role probes", async () => {
  await rfpPool.query(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id text PRIMARY KEY
    )
  `);
  await intelPool.query(`
    CREATE TABLE IF NOT EXISTS competitors (
      id text PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS prospects (
      id text PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS clients (
      id text PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS federal_intel_items (
      id text PRIMARY KEY
    )
  `);

  const [rfpDatabase, intelDatabase] = await Promise.all([
    rfpPool.query<{ current_database: string }>("SELECT current_database()"),
    intelPool.query<{ current_database: string }>("SELECT current_database()"),
  ]);

  assert.equal(rfpDatabase.rows[0]?.current_database, "rfp_core");
  assert.equal(intelDatabase.rows[0]?.current_database, "intel");
  assert.notEqual(
    rfpDatabase.rows[0]?.current_database,
    intelDatabase.rows[0]?.current_database,
  );

  const verification = await verifyDatabaseRouting();
  assert.equal(verification.roles.rfp.hasOpportunities, true);
  assert.equal(verification.roles.intel.hasCompetitors, true);
  assert.equal(verification.roles.intel.hasProspects, true);
  assert.equal(verification.roles.intel.hasClients, true);
  assert.equal(verification.roles.intel.hasFederalIntel, true);
});

test.after(async () => {
  await Promise.allSettled([rfpPool.end(), intelPool.end()]);
});
