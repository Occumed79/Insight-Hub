import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLimitedProviderPoolState,
  limitedProviderPoolSnapshot,
  runLimitedProviderPool,
} from "../limitedProviderPool";

test("limited provider pools rotate after each successful call", async () => {
  clearLimitedProviderPoolState();
  const calls: string[] = [];
  const providers = ["one", "two", "three"].map((name) => ({
    name,
    isConfigured: async () => true,
    run: async () => {
      calls.push(name);
      return [name];
    },
  }));

  const first = await runLimitedProviderPool(
    "search",
    providers,
    (value) => value.length > 0,
  );
  const second = await runLimitedProviderPool(
    "search",
    providers,
    (value) => value.length > 0,
  );
  const third = await runLimitedProviderPool(
    "search",
    providers,
    (value) => value.length > 0,
  );

  assert.equal(first.provider, "one");
  assert.equal(second.provider, "two");
  assert.equal(third.provider, "three");
  assert.deepEqual(calls, ["one", "two", "three"]);
});

test("limited provider pools fall through and cool down quota failures", async () => {
  clearLimitedProviderPoolState();
  const calls: string[] = [];
  const providers = [
    {
      name: "limited",
      isConfigured: async () => true,
      run: async () => {
        calls.push("limited");
        throw new Error("HTTP 429 quota exhausted");
      },
    },
    {
      name: "fallback",
      isConfigured: async () => true,
      run: async () => {
        calls.push("fallback");
        return ["ok"];
      },
    },
  ];

  const result = await runLimitedProviderPool(
    "enrichment",
    providers,
    (value) => value.length > 0,
  );
  assert.equal(result.provider, "fallback");
  assert.deepEqual(result.attempted, ["limited", "fallback"]);
  assert.deepEqual(result.errors, []);
  assert.match(result.recoveredErrors.join(" "), /429 quota exhausted/);
  assert.equal(
    limitedProviderPoolSnapshot()[0]?.poolProvider,
    "enrichment:limited",
  );

  clearLimitedProviderPoolState();
  calls.length = 0;
  const emptyFirst = [
    { ...providers[0], run: async () => [] as string[] },
    providers[1],
  ];
  const emptyResult = await runLimitedProviderPool(
    "empty-fallback",
    emptyFirst,
    (value) => value.length > 0,
  );
  assert.equal(emptyResult.provider, "fallback");
  assert.deepEqual(calls, ["fallback"]);
});

test("limited provider pools stop waiting on a slow provider and continue", async () => {
  clearLimitedProviderPoolState();
  const calls: string[] = [];
  const result = await runLimitedProviderPool(
    "bounded-test",
    [
      {
        name: "slow",
        isConfigured: async () => true,
        run: async () => {
          calls.push("slow");
          await new Promise((resolve) => setTimeout(resolve, 200));
          return ["late"];
        },
      },
      {
        name: "fallback",
        isConfigured: async () => true,
        run: async () => {
          calls.push("fallback");
          return ["ok"];
        },
      },
    ],
    (value) => value.length > 0,
    { attemptTimeoutMs: 20, budgetMs: 100 },
  );

  assert.equal(result.provider, "fallback");
  assert.deepEqual(calls, ["slow", "fallback"]);
  assert.deepEqual(result.errors, []);
  assert.match(
    result.recoveredErrors.join(" "),
    /slow provider timed out after 20ms/,
  );
});

test("per-attempt timeouts abort cooperative provider work before fallback", async () => {
  clearLimitedProviderPoolState();
  let slowAborted = false;
  const result = await runLimitedProviderPool(
    "abort-timeout-test",
    [
      {
        name: "slow",
        isConfigured: async () => true,
        run: async (signal) =>
          new Promise<string[]>((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => {
                slowAborted = true;
                reject(signal.reason);
              },
              { once: true },
            );
          }),
      },
      {
        name: "fallback",
        isConfigured: async () => true,
        run: async () => ["ok"],
      },
    ],
    (value) => value.length > 0,
    { attemptTimeoutMs: 20, budgetMs: 100 },
  );

  assert.equal(slowAborted, true);
  assert.equal(result.provider, "fallback");
  assert.match(result.recoveredErrors.join(" "), /timed out after 20ms/);
});

test("parent cancellation aborts work without poisoning provider cooldown state", async () => {
  clearLimitedProviderPoolState();
  const controller = new AbortController();
  let providerSawAbort = false;
  const pending = runLimitedProviderPool(
    "parent-cancel-test",
    [
      {
        name: "cooperative",
        isConfigured: async () => true,
        run: async (signal) =>
          new Promise<string[]>((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => {
                providerSawAbort = true;
                reject(signal.reason);
              },
              { once: true },
            );
          }),
      },
    ],
    (value) => value.length > 0,
    { signal: controller.signal, attemptTimeoutMs: 5_000 },
  );

  setTimeout(() => controller.abort(new Error("manual ingestion cancelled")), 10);
  await assert.rejects(pending, /manual ingestion cancelled/);
  assert.equal(providerSawAbort, true);
  assert.deepEqual(limitedProviderPoolSnapshot(), []);
});

test("limited provider pools enforce a shared call ceiling across repeated run steps", async () => {
  clearLimitedProviderPoolState();
  let calls = 0;
  const provider = {
    name: "trial-search",
    isConfigured: async () => true,
    run: async () => {
      calls += 1;
      return [String(calls)];
    },
  };

  const first = await runLimitedProviderPool(
    "trial-budget-test",
    [provider],
    (value) => value.length > 0,
    { maxAttempts: 2, budgetMs: 5_000 },
  );
  const second = await runLimitedProviderPool(
    "trial-budget-test",
    [provider],
    (value) => value.length > 0,
    { maxAttempts: 2, budgetMs: 5_000 },
  );
  const third = await runLimitedProviderPool(
    "trial-budget-test",
    [provider],
    (value) => value.length > 0,
    { maxAttempts: 2, budgetMs: 5_000 },
  );

  assert.equal(first.provider, "trial-search");
  assert.equal(second.provider, "trial-search");
  assert.equal(third.value, null);
  assert.equal(calls, 2);
  assert.deepEqual(third.errors, []);
  assert.deepEqual(third.recoveredErrors, []);
});

test("limited provider pools surface terminal errors when all fallbacks fail", async () => {
  clearLimitedProviderPoolState();
  const result = await runLimitedProviderPool<string[]>(
    "terminal-test",
    [
      {
        name: "broken",
        isConfigured: async () => true,
        run: async (): Promise<string[]> => {
          throw new Error("upstream unavailable");
        },
      },
    ],
    (value) => value.length > 0,
  );

  assert.equal(result.value, null);
  assert.equal(result.provider, null);
  assert.match(result.errors.join(" "), /upstream unavailable/);
  assert.deepEqual(result.recoveredErrors, []);
});
