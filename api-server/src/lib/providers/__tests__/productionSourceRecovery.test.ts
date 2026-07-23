import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { bsoPortalProviders } = await import("../bsoPortal");
const {
  DEEP_RECOVERY_SOURCES,
  deepRecoveryProviders,
} = await import("../deepRecoveryProviders");
const { isSupersededPublicPortalHealth } = await import(
  "../publicPortalProviders/portalHealthStore"
);

const sourceById = new Map(
  DEEP_RECOVERY_SOURCES.map((source) => [source.id, source]),
);

function healthStatus(sourceId: string, lastCheckedAt: string) {
  return {
    sourceId,
    lastCheckedAt: new Date(lastCheckedAt),
    lastFailureAt: new Date(lastCheckedAt),
    lastFailureReason: "legacy adapter failure",
    resultCount: 0,
    matchedCount: 0,
    lifetimeResultCount: 0,
    totalAttempts: 1,
    totalSuccesses: 0,
    totalFailures: 1,
    consecutiveFailures: 1,
    consecutiveNoResultSuccesses: 0,
    lastOutcome: "failed" as const,
  };
}

test("production recovery sources replace broken statewide routes exactly once", () => {
  const ids = DEEP_RECOVERY_SOURCES.map((source) => source.id);
  assert.equal(ids.length, new Set(ids).size);

  for (const id of [
    "fl-vbs",
    "la-lapac",
    "in-idoa",
    "vt-bids",
    "ri-bids",
    "pa-emarketplace",
    "ak-iris-vss",
    "nd-spo",
    "ut-purchasing",
    "wi-vendornet",
    "mn-swift",
  ]) {
    assert.ok(sourceById.has(id), `${id} recovery source is registered`);
    assert.ok(deepRecoveryProviders[id], `${id} recovery provider is registered`);
  }
});

test("corrected official routes and manual access policies are visible in source inventory", () => {
  assert.equal(
    sourceById.get("vt-bids")?.sourceUrl,
    "https://www.vermontbusinessregistry.com/BidSearch.aspx?type=5",
  );
  assert.equal(
    sourceById.get("in-idoa")?.sourceUrl,
    "https://www.in.gov/idoa/procurement/current-business-opportunities/index.html",
  );
  assert.equal(
    sourceById.get("ri-bids")?.sourceUrl,
    "https://purchasing.ri.gov/bidding/ExternalBidSearch.aspx",
  );
  assert.equal(
    sourceById.get("ut-purchasing")?.sourceUrl,
    "https://utah.bonfirehub.com/opportunities",
  );
  assert.equal(
    sourceById.get("wi-vendornet")?.sourceUrl,
    "https://vendornet.wi.gov/Bids.aspx",
  );
  assert.equal(
    sourceById.get("mn-swift")?.sourceUrl,
    "https://osp.admin.mn.gov/GS-auto",
  );
  assert.equal(
    deepRecoveryProviders["mn-swift"]?.constructor.name,
    "MinnesotaOspProvider",
  );

  const northDakota = sourceById.get("nd-spo");
  assert.equal(northDakota?.enabled, false);
  assert.equal(northDakota?.verificationStatus, "needs_review");
  assert.match(northDakota?.notes ?? "", /CAPTCHA|manual browser/i);

  const vermont = sourceById.get("vt-bids");
  assert.equal(vermont?.enabled, false);
  assert.equal(vermont?.verificationStatus, "needs_review");
  assert.match(vermont?.notes ?? "", /manual browser|removed from automated/i);
});

test("manual-access state providers complete immediately without network failures", async () => {
  for (const id of ["nd-spo", "vt-bids"]) {
    const result = await deepRecoveryProviders[id]!.fetch({ limit: 5 });
    assert.deepEqual(result, { records: [], total: 0, errors: [] });
  }
});

test("legacy BSO tenants are replaced by listing-only Periscope recovery providers", () => {
  for (const id of ["ma-commbuys", "nv-epro", "nj-start"]) {
    assert.equal(
      bsoPortalProviders[id]?.constructor.name,
      "PeriscopeListingOnlyProvider",
    );
  }
});

test("adapter replacement epochs discard only superseded health", () => {
  assert.equal(
    isSupersededPublicPortalHealth(
      healthStatus("ri-bids", "2026-07-23T20:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    isSupersededPublicPortalHealth(
      healthStatus("ri-bids", "2026-07-23T20:20:00.000Z"),
    ),
    false,
  );
  assert.equal(
    isSupersededPublicPortalHealth(
      healthStatus("ca-sacramento-city", "2026-07-23T20:00:00.000Z"),
    ),
    false,
  );
  assert.equal(
    isSupersededPublicPortalHealth(
      healthStatus("mn-swift", "2026-07-23T20:24:47.000Z"),
    ),
    true,
  );
});
