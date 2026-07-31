import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const {
  FEDERAL_MANUAL_PROVIDERS,
  MANUAL_RFP_PROVIDERS,
  effectiveProviderQuery,
  resolveManualProviders,
} = await import("../providerRunner");

test("manual Fetch Intelligence defaults to Tango plus browser discovery without broadcasting federal APIs", () => {
  assert.deepEqual(resolveManualProviders(), ["tango", "aiDiscovery"]);
  assert.deepEqual(Array.from(FEDERAL_MANUAL_PROVIDERS), [
    "samGov",
    "tango",
  ]);
  assert.deepEqual(Array.from(MANUAL_RFP_PROVIDERS), [
    "samGov",
    "tango",
    "aiDiscovery",
  ]);
});

test("selecting a federal source keeps only that source in the run plan", () => {
  assert.deepEqual(resolveManualProviders(["sam_gov"]), ["samGov"]);
  assert.deepEqual(resolveManualProviders(["tango_api"]), ["tango"]);
});

test("GovCon is rejected by open-opportunity ingestion and reserved for forecast tools", () => {
  assert.throws(
    () => resolveManualProviders(["govcon"]),
    /Unsupported RFP provider/,
  );
  assert.throws(
    () => resolveManualProviders(["govcon_api"]),
    /Unsupported RFP provider/,
  );
});

test("blank searches still enforce the Occu-Med service profile", () => {
  assert.equal(effectiveProviderQuery(), "occupational health services");
  assert.equal(
    effectiveProviderQuery("  medical surveillance  "),
    "medical surveillance",
  );
});

test("legacy portal selections collapse into one AI discovery provider without adding a second federal source", () => {
  assert.deepEqual(
    resolveManualProviders([
      "sam_gov",
      "publicPortalProviders",
      "eunaBonfire",
      "internationalPublicPortals",
    ]),
    ["samGov", "aiDiscovery"],
  );
});

test("browser discovery can still run alone while crawler providers stay unavailable", () => {
  assert.deepEqual(resolveManualProviders(["aiDiscovery"]), ["aiDiscovery"]);
  assert.throws(
    () => resolveManualProviders(["firecrawl"]),
    /Unsupported RFP provider/,
  );
});
