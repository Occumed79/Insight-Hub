import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { databaseIdentity, verifyDatabaseSilo } from "../verify-database-silo";

describe("database silo verification", () => {
  it("requires both database URLs", async () => {
    await assert.rejects(
      () => verifyDatabaseSilo({} as NodeJS.ProcessEnv),
      /must both be configured/,
    );
  });

  it("rejects URLs resolving to the same database despite credential differences", async () => {
    await assert.rejects(
      () =>
        verifyDatabaseSilo({
          RFP_DATABASE_URL: "postgresql://rfp:one@db.example.test/insight",
          INTEL_DATABASE_URL:
            "postgresql://intel:two@db.example.test/insight?sslmode=require",
        } as NodeJS.ProcessEnv),
      /same database/,
    );
  });

  it("recognizes separate RFP and intel databases and isolated schema exports", async () => {
    await verifyDatabaseSilo({
      RFP_DATABASE_URL: "postgresql://user:pass@rfp.example.test/rfp",
      INTEL_DATABASE_URL: "postgresql://user:pass@intel.example.test/intel",
    } as NodeJS.ProcessEnv);
  });

  it("database identity ignores credentials and query parameters", () => {
    assert.equal(
      databaseIdentity(
        "postgresql://one:a@db.example.test:5432/app?sslmode=require",
      ),
      databaseIdentity("postgresql://two:b@db.example.test/app"),
    );
  });
});
