import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { MANUAL_RFP_PROVIDERS, resolveManualProviders } = await import("../providerRunner");

test("manual Fetch Intelligence defaults to Tango plus one browser discovery pass", () => {
  assert.deepEqual(resolveManualProviders(), ["tango", "aiDiscovery"]);
  assert.deepEqual(Array.from(MANUAL_RFP_PROVIDERS), ["tango", "samGov", "aiDiscovery"]);
});

test("legacy scraper selections collapse into the AI discovery provider", () => {
  assert.deepEqual(
    resolveManualProviders(["sam_gov", "publicPortalProviders", "eunaBonfire", "internationalPublicPortals"]),
    ["samGov", "aiDiscovery"],
  );
});

test("Tango is a supported direct API provider while crawler providers stay unavailable", () => {
  assert.deepEqual(resolveManualProviders(["tango_api"]), ["tango"]);
  assert.throws(() => resolveManualProviders(["firecrawl"]), /Unsupported RFP provider/);
});
