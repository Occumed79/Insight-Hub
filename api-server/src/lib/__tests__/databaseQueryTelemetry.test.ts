import assert from "node:assert/strict";
import test from "node:test";
import {
  databaseQueryTelemetrySnapshot,
  describeSqlQuery,
  instrumentPoolQueries,
  resetDatabaseQueryTelemetryForTests,
} from "../../../../lib/db/src/queryTelemetry";

test("database query descriptors expose operation and relation without values", () => {
  assert.deepEqual(
    describeSqlQuery({
      text: "SELECT id, title FROM opportunities WHERE title = $1 AND agency = $2",
      values: ["secret title", "secret agency"],
    }),
    { operation: "SELECT", relation: "opportunities" },
  );
  assert.deepEqual(
    describeSqlQuery("INSERT INTO opportunity_feedback (id, grade) VALUES ($1, $2)"),
    { operation: "INSERT", relation: "opportunity_feedback" },
  );
  assert.deepEqual(
    describeSqlQuery("UPDATE settings SET value = $1 WHERE key = $2"),
    { operation: "UPDATE", relation: "settings" },
  );
  assert.deepEqual(
    describeSqlQuery("DELETE FROM opportunity_staging WHERE id = $1"),
    { operation: "DELETE", relation: "opportunity_staging" },
  );
});

test("database query descriptors do not preserve parameter literals", () => {
  const descriptor = JSON.stringify(
    describeSqlQuery("SELECT * FROM opportunities WHERE description = 'do not expose me'"),
  );
  assert.equal(descriptor.includes("do not expose me"), false);
});

test("database query telemetry evicts old descriptors and retains no SQL text or values", async () => {
  resetDatabaseQueryTelemetryForTests();
  const stubPool = instrumentPoolQueries(
    {
      query: async (..._args: any[]) => ({ rows: [] }),
    },
    "rfp",
  );

  await stubPool.query("SELECT 1 AS healthy");
  for (let index = 0; index < 200; index += 1) {
    await stubPool.query(`SELECT id FROM relation_${index} WHERE secret = $1`, [
      `secret-${index}`,
    ]);
  }

  const snapshot = databaseQueryTelemetrySnapshot();
  assert.equal(snapshot.metricLimit, 64);
  assert.equal(snapshot.queries.length, snapshot.metricLimit);
  assert.equal(snapshot.queries.some((entry) => entry.relation === "relation_0"), false);
  assert.equal(snapshot.queries.some((entry) => entry.relation === "relation_199"), true);

  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes("SELECT id FROM relation_199"), false);
  assert.equal(serialized.includes("secret-199"), false);
  for (const entry of snapshot.queries) {
    assert.equal(Object.hasOwn(entry, "text"), false);
    assert.equal(Object.hasOwn(entry, "values"), false);
  }
});
