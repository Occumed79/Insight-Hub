import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const {
  FEDERAL_MANUAL_PROVIDERS,
  MANUAL_RFP_PROVIDERS,
  resolveManualProviders,
} = await import("../providerRunner");

test("manual Fetch Intelligence searches GovCon, SAM.gov, Tango, and browser discovery", () => {
  assert.deepEqual(resolveManualProviders(), [
    "govcon",
    "samGov",
    "tango",
    "aiDiscovery",
  ]);
  assert.deepEqual(Array.from(FEDERAL_MANUAL_PROVIDERS), [
    "govcon",
    "samGov",
    "tango",
  ]);
  assert.deepEqual(Array.from(MANUAL_RFP_PROVIDERS), [
    "govcon",
    "samGov",
    "tango",
    "aiDiscovery",
  ]);
});

test("selecting any federal source expands to all three structured federal APIs", () => {
  assert.deepEqual(resolveManualProviders(["sam_gov"]), [
    "govcon",
    "samGov",
    "tango",
  ]);
  assert.deepEqual(resolveManualProviders(["tango_api"]), [
    "govcon",
    "samGov",
    "tango",
  ]);
  assert.deepEqual(resolveManualProviders(["govcon_api"]), [
    "govcon",
    "samGov",
    "tango",
  ]);
});

test("legacy portal selections collapse into one AI discovery provider after federal expansion", () => {
  assert.deepEqual(
    resolveManualProviders([
      "sam_gov",
      "publicPortalProviders",
      "eunaBonfire",
      "internationalPublicPortals",
    ]),
    ["govcon", "samGov", "tango", "aiDiscovery"],
  );
});

test("browser discovery can still run alone while crawler providers stay unavailable", () => {
  assert.deepEqual(resolveManualProviders(["aiDiscovery"]), ["aiDiscovery"]);
  assert.throws(
    () => resolveManualProviders(["firecrawl"]),
    /Unsupported RFP provider/,
  );
});
