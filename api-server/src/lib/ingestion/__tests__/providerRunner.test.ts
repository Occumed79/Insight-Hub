import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { MANUAL_RFP_PROVIDERS, resolveManualProviders } = await import("../providerRunner");

test("manual Fetch Intelligence defaults to official SAM plus one AI discovery pass", () => {
  assert.deepEqual(resolveManualProviders(), ["samGov", "aiDiscovery"]);
  assert.deepEqual(Array.from(MANUAL_RFP_PROVIDERS), ["samGov", "aiDiscovery"]);
});

test("legacy scraper selections collapse into the AI discovery provider", () => {
  assert.deepEqual(
    resolveManualProviders(["sam_gov", "publicPortalProviders", "eunaBonfire", "internationalPublicPortals"]),
    ["samGov", "aiDiscovery"],
  );
});

test("direct scraper providers are no longer runnable through manual ingestion", () => {
  assert.throws(() => resolveManualProviders(["tango"]), /Unsupported RFP provider/);
});
