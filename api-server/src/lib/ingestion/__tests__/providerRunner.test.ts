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
  isOfficialSamOpportunityUrl,
  isSamGovRecoverableApiError,
  mergeDiscoveryRecords,
  resolveManualProviders,
} = await import("../providerRunner");
const { mergeSourceRefresh } = await import("../pipelineRules");
const { discoveryQuotaPolicy } = await import("../../discoveryQuotaPolicy");
const { sourceDefinition } = await import("../../sourceArchitecture");

test("manual Fetch Intelligence defaults to U.S., Canada/Europe, and browser discovery", () => {
  assert.deepEqual(resolveManualProviders(), [
    "samGov",
    "tango",
    "internationalPublicPortals",
    "aiDiscovery",
  ]);
  assert.deepEqual(Array.from(FEDERAL_MANUAL_PROVIDERS), ["samGov", "tango"]);
  assert.deepEqual(Array.from(MANUAL_RFP_PROVIDERS), [
    "samGov",
    "tango",
    "internationalPublicPortals",
    "aiDiscovery",
    "emailNotifications",
    "rssAggregator",
  ]);
});

test("explicit SAM and Tango selections stay independent", () => {
  assert.deepEqual(resolveManualProviders(["sam_gov"]), ["samGov"]);
  assert.deepEqual(resolveManualProviders(["tango_api"]), ["tango"]);
  assert.deepEqual(resolveManualProviders(["samGov", "aiDiscovery"]), [
    "samGov",
    "aiDiscovery",
  ]);
  assert.deepEqual(resolveManualProviders(["tango", "aiDiscovery"]), [
    "tango",
    "aiDiscovery",
  ]);
});

test("CanadaBuys and TED aliases resolve to the international procurement source", () => {
  assert.deepEqual(resolveManualProviders(["canadaBuys"]), [
    "internationalPublicPortals",
  ]);
  assert.deepEqual(resolveManualProviders(["ted"]), [
    "internationalPublicPortals",
  ]);
  assert.deepEqual(
    resolveManualProviders(["canadaBuys", "ted", "internationalOpportunities"]),
    ["internationalPublicPortals"],
  );
});

test("selecting both federal sources preserves both without collapsing either", () => {
  assert.deepEqual(resolveManualProviders(["tango", "samGov", "aiDiscovery"]), [
    "tango",
    "samGov",
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

test("recognizes unavailable SAM API access and only accepts official SAM hosts", () => {
  assert.equal(isSamGovRecoverableApiError(new Error("SAM.gov API error 429: code 900804 Message throttled out")), true);
  assert.equal(isSamGovRecoverableApiError(new Error("SAM_API_KEY_NOT_CONFIGURED")), true);
  assert.equal(isOfficialSamOpportunityUrl("https://sam.gov/opp/example/view"), true);
  assert.equal(isOfficialSamOpportunityUrl("https://sam.gov.evil.test/opp/example/view"), false);
});

test("legacy U.S. portal selections still collapse into browser discovery while international is first-class", () => {
  assert.deepEqual(
    resolveManualProviders([
      "sam_gov",
      "publicPortalProviders",
      "eunaBonfire",
      "internationalPublicPortals",
    ]),
    ["samGov", "aiDiscovery", "internationalPublicPortals"],
  );
});

test("international source is active direct procurement architecture", () => {
  assert.equal(sourceDefinition("internationalPublicPortals")?.active, true);
  assert.equal(sourceDefinition("internationalPublicPortals")?.role, "direct_source");
});

test("browser discovery can still run alone while internal discovery members are not top-level manual sources", () => {
  assert.deepEqual(resolveManualProviders(["aiDiscovery"]), ["aiDiscovery"]);
  assert.throws(
    () => resolveManualProviders(["firecrawl"]),
    /Unsupported RFP provider/,
  );
  assert.throws(
    () => resolveManualProviders(["serper"]),
    /Unsupported RFP provider/,
  );
  assert.throws(
    () => resolveManualProviders(["scheduledCrawler"]),
    /Unsupported RFP provider/,
  );
});

test("quota policy spends renewable daily capacity before monthly and metered fallbacks", () => {
  const you = discoveryQuotaPolicy("you");
  const browserbase = discoveryQuotaPolicy("browserbase");
  const exa = discoveryQuotaPolicy("exa");
  const firecrawl = discoveryQuotaPolicy("firecrawl");
  const langsearch = discoveryQuotaPolicy("langsearch");
  const websearch = discoveryQuotaPolicy("websearch");

  assert.equal(you?.renewal, "daily");
  assert.equal(exa?.renewal, "monthly");
  assert.ok((you?.priority ?? Infinity) < (browserbase?.priority ?? -Infinity));
  assert.ok((browserbase?.priority ?? Infinity) < (exa?.priority ?? -Infinity));
  assert.ok((exa?.priority ?? Infinity) <= (firecrawl?.priority ?? -Infinity));
  assert.ok((firecrawl?.priority ?? Infinity) < (langsearch?.priority ?? -Infinity));
  assert.ok((langsearch?.priority ?? Infinity) < (websearch?.priority ?? -Infinity));
});

test("Serper and OloStep remain registered only as inactive legacy compatibility shells", () => {
  assert.equal(sourceDefinition("serper")?.active, false);
  assert.equal(sourceDefinition("serper")?.role, "legacy_disabled");
  assert.equal(sourceDefinition("olostep")?.active, false);
  assert.equal(sourceDefinition("olostep")?.role, "legacy_disabled");
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
      externalId: "you-1",
      source: "you",
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

test("canonical authority uses real providerName inside the coarse manual providerKey bucket", () => {
  const existing = {
    id: "canonical-1",
    providerKey: "manual",
    providerName: "exa",
    source: "manual",
    title: "Richer Exa discovery record",
    description: "Detailed occupational-health procurement evidence.",
    createdAt: "created",
    firstSeenAt: "first",
  };
  const merged = mergeSourceRefresh(existing, {
    providerKey: "manual",
    providerName: "rssAggregator",
    source: "manual",
    title: "Weaker RSS copy",
    description: "Short copy",
  } as any);
  assert.equal(merged.providerName, "exa");
  assert.equal(merged.title, "Richer Exa discovery record");
  assert.equal(merged.description, "Detailed occupational-health procurement evidence.");
});
