import assert from "node:assert/strict";
import test from "node:test";
import { describeSqlQuery } from "@workspace/db";

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
