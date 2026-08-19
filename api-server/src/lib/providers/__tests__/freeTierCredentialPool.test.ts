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

test("sticky account pools keep using the current account until it fails", async () => {
  clearFreeTierCredentialPoolState();
  process.env.TEST_STICKY_KEY_1 = "account-one";
  process.env.TEST_STICKY_KEY_2 = "account-two";
  const pool = new FreeTierCredentialPool(
    "sticky-success-test",
    [
      { envKey: "TEST_STICKY_KEY_1" },
      { envKey: "TEST_STICKY_KEY_2" },
    ],
    { rotateOnSuccess: false },
  );

  assert.equal(await pool.run(async (key) => key), "account-one");
  assert.equal(await pool.run(async (key) => key), "account-one");
});

test("sticky account pools fail over on explicit quota exhaustion and stay on the replacement account", async () => {
  clearFreeTierCredentialPoolState();
  process.env.TEST_STICKY_FAIL_KEY_1 = "account-one";
  process.env.TEST_STICKY_FAIL_KEY_2 = "account-two";
  const attempted: string[] = [];
  let primaryQuotaExhausted = true;
  const pool = new FreeTierCredentialPool(
    "sticky-failover-test",
    [
      { envKey: "TEST_STICKY_FAIL_KEY_1" },
      { envKey: "TEST_STICKY_FAIL_KEY_2" },
    ],
    { rotateOnSuccess: false },
  );

  const first = await pool.run(async (key) => {
    attempted.push(key);
    if (key === "account-one" && primaryQuotaExhausted) {
      primaryQuotaExhausted = false;
      throw new Error("TEAM_BUDGET_EXCEEDED monthly credits exhausted");
    }
    return key;
  });
  const second = await pool.run(async (key) => {
    attempted.push(key);
    return key;
  });

  assert.equal(first, "account-two");
  assert.equal(second, "account-two");
  assert.deepEqual(attempted, ["account-one", "account-two", "account-two"]);

  const snapshot = await pool.snapshot();
  const firstSlot = snapshot.slots.find(
    (slot) => slot.slot === "TEST_STICKY_FAIL_KEY_1",
  )!;
  const secondSlot = snapshot.slots.find(
    (slot) => slot.slot === "TEST_STICKY_FAIL_KEY_2",
  )!;
  assert.equal(firstSlot.lastOutcome, "quota");
  assert.equal(firstSlot.coolingDown, true);
  assert.equal(secondSlot.active, true);
  assert.equal(secondSlot.successes, 2);
});

test("cools down an HTTP 429 account as rate-limited and immediately falls back", async () => {
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
    if (key === "limited") throw new Error("HTTP 429 rate limit exceeded");
    return "ok";
  });

  assert.equal(result, "ok");
  assert.deepEqual(attempted, ["limited", "healthy"]);
  const limited = (await pool.snapshot()).slots.find(
    (slot) => slot.slot === "TEST_POOL_KEY_1",
  )!;
  assert.equal(limited.lastOutcome, "rate_limited");
  assert.equal(limited.coolingDown, true);
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

test("safe pool telemetry exposes vendor quota state but never credential values", async () => {
  clearFreeTierCredentialPoolState();
  process.env.TEST_TELEMETRY_KEY_1 = "secret-primary-value";
  process.env.TEST_TELEMETRY_KEY_2 = "secret-backup-value";
  const pool = new FreeTierCredentialPool(
    "telemetry-test",
    [
      { envKey: "TEST_TELEMETRY_KEY_1" },
      { envKey: "TEST_TELEMETRY_KEY_2" },
    ],
    { rotateOnSuccess: false },
  );

  await pool.run(async (_key, slot) => {
    pool.recordRateLimitHeaders(
      slot,
      new Headers({
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": "87",
        "X-RateLimit-Reset": "60",
      }),
    );
    return "ok";
  });

  const snapshot = await pool.snapshot();
  assert.equal(snapshot.configuredAccounts, 2);
  assert.equal(snapshot.activeSlot, "TEST_TELEMETRY_KEY_1");
  assert.deepEqual(
    snapshot.slots.map((slot) => slot.slot),
    ["TEST_TELEMETRY_KEY_1", "TEST_TELEMETRY_KEY_2"],
  );
  const primary = snapshot.slots[0]!;
  assert.equal(primary.attempts, 1);
  assert.equal(primary.successes, 1);
  assert.equal(primary.lastOutcome, "success");
  assert.equal(primary.quotaLimit, 100);
  assert.equal(primary.quotaRemaining, 87);
  assert.ok(primary.quotaResetAt);

  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /secret-primary-value/);
  assert.doesNotMatch(serialized, /secret-backup-value/);
});
