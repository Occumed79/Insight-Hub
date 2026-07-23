import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { bsoPortalProviders } = await import("../bsoPortal");
const {
  DEEP_RECOVERY_SOURCES,
  deepRecoveryProviders,
} = await import("../deepRecoveryProviders");

const sourceById = new Map(
  DEEP_RECOVERY_SOURCES.map((source) => [source.id, source]),
);

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
  ]) {
    assert.ok(sourceById.has(id), `${id} recovery source is registered`);
    assert.ok(deepRecoveryProviders[id], `${id} recovery provider is registered`);
  }
});

test("corrected official routes and manual access policy are visible in source inventory", () => {
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
    "https://www.purchasing.ri.gov/bidding/ExternalBidSearch.aspx",
  );
  assert.equal(
    sourceById.get("ut-purchasing")?.sourceUrl,
    "https://utah.bonfirehub.com/opportunities",
  );

  const northDakota = sourceById.get("nd-spo");
  assert.equal(northDakota?.enabled, false);
  assert.equal(northDakota?.verificationStatus, "needs_review");
  assert.match(northDakota?.notes ?? "", /CAPTCHA|manual browser/i);
});

test("North Dakota manual provider completes immediately without a network failure", async () => {
  const result = await deepRecoveryProviders["nd-spo"]!.fetch({ limit: 5 });
  assert.deepEqual(result, { records: [], total: 0, errors: [] });
});

test("legacy BSO tenants are replaced by listing-only Periscope recovery providers", () => {
  for (const id of ["ma-commbuys", "nv-epro", "nj-start"]) {
    assert.equal(
      bsoPortalProviders[id]?.constructor.name,
      "PeriscopeListingOnlyProvider",
    );
  }
});
