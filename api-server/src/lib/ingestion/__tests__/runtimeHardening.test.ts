import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const {
  isTransientDatabaseError,
  withTransientDatabaseRetry,
} = await import("../../databaseReliability");
const { formatProviderProgress } = await import("../manualIngestion");
const { isTransientPortalAdapterError } = await import(
  "../../providers/auditedPublicPortalProvider"
);

test("recognizes nested Neon connection timeouts", () => {
  const error = new AggregateError(
    [
      Object.assign(new Error("connect ETIMEDOUT 35.168.64.81:5432"), {
        code: "ETIMEDOUT",
      }),
      Object.assign(new Error("network is unreachable"), {
        code: "ENETUNREACH",
      }),
    ],
    "database connection failed",
  );
  assert.equal(isTransientDatabaseError(error), true);
  assert.equal(
    isTransientDatabaseError(Object.assign(new Error("duplicate key"), { code: "23505" })),
    false,
  );
});

test("retries transient database work but not permanent failures", async () => {
  let attempts = 0;
  const result = await withTransientDatabaseRetry(
    "heartbeat",
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw Object.assign(new Error("connect ETIMEDOUT"), {
          code: "ETIMEDOUT",
        });
      }
      return "ok";
    },
    { attempts: 3, delaysMs: [0, 0] },
  );
  assert.equal(result, "ok");
  assert.equal(attempts, 3);

  let permanentAttempts = 0;
  await assert.rejects(
    withTransientDatabaseRetry("invalid query", async () => {
      permanentAttempts += 1;
      throw Object.assign(new Error("column does not exist"), { code: "42703" });
    }),
  );
  assert.equal(permanentAttempts, 1);
});

test("formats source-level adapter progress for the ingestion modal", () => {
  assert.deepEqual(
    formatProviderProgress({
      provider: "publicPortalProviders",
      phase: "source_start",
      sourceId: "ca-alameda-county",
      sourceName: "Alameda County",
      index: 3,
      total: 20,
    }),
    {
      currentProvider: "publicPortalProviders:ca-alameda-county",
      message: "Adapter 3/20: Alameda County",
    },
  );

  assert.deepEqual(
    formatProviderProgress({
      provider: "publicPortalProviders",
      phase: "discovery_start",
      sourceId: "ai-web-discovery",
      sourceName: "AI web discovery",
    }),
    {
      currentProvider: "publicPortalProviders:ai-web-discovery",
      message: "AI/web discovery is running once for this Fetch Intelligence run",
    },
  );
});

test("retries only transient adapter failures", () => {
  assert.equal(
    isTransientPortalAdapterError(
      Object.assign(new Error("fetch failed"), { code: "ETIMEDOUT" }),
    ),
    true,
  );
  assert.equal(
    isTransientPortalAdapterError("portal returned HTTP 503"),
    true,
  );
  assert.equal(
    isTransientPortalAdapterError("blocked: robots disallow source"),
    false,
  );
  assert.equal(
    isTransientPortalAdapterError("portal returned HTTP 403"),
    false,
  );
});
