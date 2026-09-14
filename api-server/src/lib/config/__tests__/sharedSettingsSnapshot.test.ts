import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("first-paint settings readers share the same coalesced settings snapshot", () => {
  const sharedSnapshot = source("../sharedSettingsSnapshot.ts");
  const settingsRoute = source("../../../routes/settings.ts");
  const runtimeInventoryRoute = source("../../../routes/rfp-sources-runtime.ts");

  assert.match(sharedSnapshot, /export async function loadSettingsSnapshot\(/);
  assert.match(sharedSnapshot, /createCredentialSettingsCache/);
  assert.match(settingsRoute, /loadSettingsSnapshot/);
  assert.match(runtimeInventoryRoute, /loadSettingsSnapshot/);
  assert.match(runtimeInventoryRoute, /healthFromSettings\(settingsSnapshot\)/);
  assert.match(
    runtimeInventoryRoute,
    /approvedCrawlerConfigsFromSettings\(settingsSnapshot\)/,
  );
});

test("settings writes invalidate both credential and shared settings snapshots", () => {
  const settingsRoute = source("../../../routes/settings.ts");

  assert.match(settingsRoute, /invalidateCredentialSettingsCache\(\)/);
  assert.match(settingsRoute, /invalidateSettingsSnapshotCache\(\)/);
});
