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
  mergeDiscoveryRecords,
  resolveManualProviders,
} = await import("../providerRunner");

test("manual Fetch Intelligence defaults to both federal sources plus browser discovery", () => {
  assert.deepEqual(resolveManualProviders(), ["samGov", "tango", "aiDiscovery"]);
  assert.deepEqual(Array.from(FEDERAL_MANUAL_PROVIDERS), ["samGov", "tango"]);
  assert.deepEqual(Array.from(MANUAL_RFP_PROVIDERS), [
    "samGov",
    "tango",
    "aiDiscovery",
    "emailNotifications",
    "rssAggregator",
  ]);
});

test("selecting either federal source keeps the complete structured federal ensemble", () => {
  assert.deepEqual(resolveManualProviders(["sam_gov"]), ["samGov", "tango"]);
  assert.deepEqual(resolveManualProviders(["tango_api"]), ["samGov", "tango"]);
});

test("selecting both federal sources never collapses one into fallback", () => {
  assert.deepEqual(resolveManualProviders(["tango", "samGov", "aiDiscovery"]), [
    "samGov",
    "tango",
    "aiDiscovery",
  ]);
  assert.deepEqual(resolveManualProviders(["samGov", "tango", "aiDiscovery"]), [
    "samGov",
    "tango",
    "aiDiscovery",
  ]);
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

test("legacy portal selections collapse into browser discovery while retaining the full federal ensemble", () => {
  assert.deepEqual(
    resolveManualProviders([
      "sam_gov",
      "publicPortalProviders",
      "eunaBonfire",
      "internationalPublicPortals",
    ]),
    ["samGov", "tango", "aiDiscovery"],
  );
});

test("browser discovery can still run alone while crawler providers stay unavailable", () => {
  assert.deepEqual(resolveManualProviders(["aiDiscovery"]), ["aiDiscovery"]);
  assert.throws(
    () => resolveManualProviders(["firecrawl"]),
    /Unsupported RFP provider/,
  );
  assert.throws(
    () => resolveManualProviders(["scheduledCrawler"]),
    /Unsupported RFP provider/,
  );
});

test("browser discovery collapses one solicitation across different result URLs and keeps the richer record", () => {
  const base = {
    title: "Occupational Health Services RFP",
    agency: "County of Fresno",
    type: "RFP",
    status: "active" as const,
    postedDate: new Date("2026-08-01T00:00:00Z"),
    responseDeadline: new Date("2026-09-01T00:00:00Z"),
    solicitationNumber: "RFP-26-100",
    description: "Occupational health examinations and drug testing.",
  };
  const merged = mergeDiscoveryRecords([
    {
      ...base,
      externalId: "serper-1",
      source: "serper",
      sourceUrl: "https://search.example/one",
      rawData: { relevanceScore: 72, sourceConfidence: "low" },
    },
    {
      ...base,
      externalId: "exa-1",
      source: "exa",
      sourceUrl: "https://official.example/rfp-26-100",
      description:
        "Occupational health examinations, drug testing, audiometry, and medical surveillance.",
      rawData: { relevanceScore: 86, sourceConfidence: "medium" },
    },
  ] as any);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].externalId, "exa-1");
});
