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
