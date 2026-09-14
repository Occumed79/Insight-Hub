import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("high-traffic settings readers share the same coalesced settings snapshot", () => {
  const providerConfig = source("../providerConfig.ts");
  const settingsRoute = source("../../../routes/settings.ts");
  const portalHealthStore = source("../../providers/publicPortalProviders/portalHealthStore.ts");
  const discoveryCandidateStore = source("../../crawler/discoveryCandidateStore.ts");

  assert.match(providerConfig, /export async function loadSettingsSnapshot\(/);

  for (const [name, text] of [
    ["settings route", settingsRoute],
    ["portal health store", portalHealthStore],
    ["crawler discovery candidate store", discoveryCandidateStore],
  ] as const) {
    assert.match(text, /loadSettingsSnapshot/,
      `${name} must read from the shared settings snapshot`);
  }
});

test("settings-backed health and crawler writes invalidate the shared snapshot", () => {
  const portalHealthStore = source("../../providers/publicPortalProviders/portalHealthStore.ts");
  const discoveryCandidateStore = source("../../crawler/discoveryCandidateStore.ts");

  assert.match(portalHealthStore, /invalidateSettingsSnapshotCache\(\)/);
  assert.match(discoveryCandidateStore, /invalidateSettingsSnapshotCache\(\)/);
});
