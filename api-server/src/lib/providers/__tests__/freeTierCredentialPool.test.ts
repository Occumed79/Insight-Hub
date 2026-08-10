import assert from "node:assert/strict";
import test from "node:test";
import {
  clearFreeTierCredentialPoolState,
  FreeTierCredentialPool,
} from "../freeTierCredentialPool";

test("rotates distinct free-tier credentials after successful calls", async () => {
  clearFreeTierCredentialPoolState();
  process.env.TEST_POOL_KEY_1 = "first";
  process.env.TEST_POOL_KEY_2 = "second";
  const pool = new FreeTierCredentialPool("rotation-test", [
    { envKey: "TEST_POOL_KEY_1" },
    { envKey: "TEST_POOL_KEY_2" },
  ]);

  assert.equal(await pool.run(async (key) => key), "first");
  assert.equal(await pool.run(async (key) => key), "second");
});

test("cools down a quota-limited key and immediately falls back", async () => {
  clearFreeTierCredentialPoolState();
  process.env.TEST_POOL_KEY_1 = "limited";
  process.env.TEST_POOL_KEY_2 = "healthy";
  const attempted: string[] = [];
  const pool = new FreeTierCredentialPool("fallback-test", [
    { envKey: "TEST_POOL_KEY_1" },
    { envKey: "TEST_POOL_KEY_2" },
  ]);

  const result = await pool.run(async (key) => {
    attempted.push(key);
    if (key === "limited") throw new Error("HTTP 429 quota exhausted");
    return "ok";
  });

  assert.equal(result, "ok");
  assert.deepEqual(attempted, ["limited", "healthy"]);
});

test("does not spend backup keys on deterministic bad requests", async () => {
  clearFreeTierCredentialPoolState();
  process.env.TEST_POOL_KEY_1 = "first";
  process.env.TEST_POOL_KEY_2 = "second";
  const attempted: string[] = [];
  const pool = new FreeTierCredentialPool("bad-request-test", [
    { envKey: "TEST_POOL_KEY_1" },
    { envKey: "TEST_POOL_KEY_2" },
  ]);

  await assert.rejects(
    pool.run(async (key) => {
      attempted.push(key);
      throw new Error("HTTP 400 invalid request body");
    }),
    /400 invalid request body/,
  );
  assert.deepEqual(attempted, ["first"]);
});
