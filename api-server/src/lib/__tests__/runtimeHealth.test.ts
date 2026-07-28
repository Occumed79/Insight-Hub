import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const {
  markRuntimeReady,
  markRuntimeShuttingDown,
  runtimeLiveness,
} = await import("../runtimeHealth");

test("runtime lifecycle is visible to liveness checks", () => {
  markRuntimeReady();
  const ready = runtimeLiveness();
  assert.equal(ready.ok, true);
  assert.equal(ready.awake, true);
  assert.equal(ready.ready, true);
  assert.equal(ready.shuttingDown, false);
  assert.ok(ready.uptimeSeconds >= 0);

  markRuntimeShuttingDown();
  const stopping = runtimeLiveness();
  assert.equal(stopping.ok, true);
  assert.equal(stopping.ready, false);
  assert.equal(stopping.shuttingDown, true);
});
