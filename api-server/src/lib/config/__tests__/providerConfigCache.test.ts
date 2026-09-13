import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { createCredentialSettingsCache } = await import("../providerConfig");

test("credential settings cache coalesces concurrent loads and reuses the snapshot within TTL", async () => {
  let loadCount = 0;
  let now = 1_000;
  const cache = createCredentialSettingsCache(
    async () => {
      loadCount += 1;
      await Promise.resolve();
      return new Map([["samApiKey", `db-key-${loadCount}`]]);
    },
    5_000,
    () => now,
  );

  const [first, second, third] = await Promise.all([
    cache.get(),
    cache.get(),
    cache.get(),
  ]);

  assert.equal(loadCount, 1);
  assert.equal(first.get("samApiKey"), "db-key-1");
  assert.equal(second, first);
  assert.equal(third, first);

  const withinTtl = await cache.get();
  assert.equal(loadCount, 1);
  assert.equal(withinTtl, first);

  now += 5_001;
  const afterTtl = await cache.get();
  assert.equal(loadCount, 2);
  assert.equal(afterTtl.get("samApiKey"), "db-key-2");
});

test("credential settings cache invalidation forces the next read to reload", async () => {
  let loadCount = 0;
  const cache = createCredentialSettingsCache(async () => {
    loadCount += 1;
    return new Map([["token", `value-${loadCount}`]]);
  });

  assert.equal((await cache.get()).get("token"), "value-1");
  cache.invalidate();
  assert.equal((await cache.get()).get("token"), "value-2");
  assert.equal(loadCount, 2);
});
