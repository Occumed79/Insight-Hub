import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { filterManualOnlyPortalHealth } = await import(
  "../../../middleware/manual-only-portal-health-boundary"
);
const { bsoPortalProviders } = await import("../bsoPortal");
const {
  DEEP_RECOVERY_SOURCES,
  deepRecoveryProviders,
} = await import("../deepRecoveryProviders");
const {
  MANUAL_ONLY_PORTAL_IDS,
  manualOnlyPortalReason,
} = await import("../manualOnlyPortalPolicy");
const { portalConnectorCapability } = await import("../portalCapabilities");
const { getRegisteredPublicPortalAdapter } = await import(
  "../publicPortalAdapterRegistry"
);
const { PUBLIC_PORTAL_SOURCES } = await import("../publicPortalProviders/catalog");
const {
  isSupersededPublicPortalHealth,
  selectFairPortalSources,
} = await import("../publicPortalProviders/portalHealthStore");
const { STATEWIDE_PROCUREMENT_SOURCES } = await import(
  "../statewideProcurementConfigs"
);

const sourceById = new Map(
  DEEP_RECOVERY_SOURCES.map((source) => [source.id, source]),
);
const statewideSourceById = new Map(
  STATEWIDE_PROCUREMENT_SOURCES.map((source) => [source.id, source]),
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
    "ct-ctsource",
    "al-state-procurement",
    "nm-active-procurements",
    "nc-evp",
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

  for (const id of [
    "nd-spo",
    "vt-bids",
    "ri-bids",
    "wi-vendornet",
    "ct-ctsource",
    "al-state-procurement",
    "nm-active-procurements",
    "nc-evp",
  ]) {
    const source = sourceById.get(id);
    assert.equal(source?.enabled, false, `${id} is disabled`);
    assert.equal(
      source?.verificationStatus,
      "needs_review",
      `${id} is manual-only`,
    );
  }
});

test("all seventeen current failures are manual-only and excluded from automation", () => {
  assert.equal(MANUAL_ONLY_PORTAL_IDS.size, 17);
  const derivedIds = new Set(PUBLIC_PORTAL_SOURCES.map((source) => source.id));

  for (const id of MANUAL_ONLY_PORTAL_IDS) {
    assert.ok(manualOnlyPortalReason(id), `${id} has an audit reason`);
    assert.equal(
      portalConnectorCapability({
        id,
        country: "US",
        level: "state",
        accessMode: "public_html",
      }).connectorStatus,
      "directory_only",
      `${id} is displayed as manual-only`,
    );
    if (!sourceById.has(id) && !statewideSourceById.has(id)) {
      assert.equal(
        derivedIds.has(id),
        false,
        `${id} is excluded from generic catalog automation`,
      );
    }
  }

  for (const id of [
    "ct-ctsource",
    "al-state-procurement",
    "nm-active-procurements",
    "nc-evp",
  ]) {
    const source = statewideSourceById.get(id);
    assert.equal(source?.enabled, false, `${id} is disabled`);
    assert.equal(source?.verificationStatus, "needs_review");
  }
});

test("manual-access state providers complete immediately without network failures", async () => {
  for (const id of [
    "nd-spo",
    "vt-bids",
    "ri-bids",
    "wi-vendornet",
    "ct-ctsource",
    "al-state-procurement",
    "nm-active-procurements",
    "nc-evp",
  ]) {
    const result = await deepRecoveryProviders[id]!.fetch({ limit: 5 });
    assert.deepEqual(result, { records: [], total: 0, errors: [] });
  }
});

test("disabled sources can never enter fair rotation", () => {
  const active = sourceById.get("mn-swift");
  const disabled = sourceById.get("ct-ctsource");
  assert.ok(active);
  assert.ok(disabled);
  assert.ok(getRegisteredPublicPortalAdapter(active.id));
  assert.equal(getRegisteredPublicPortalAdapter(disabled.id), undefined);

  const runtimeAuthorized = [active, disabled].filter((source) =>
    Boolean(getRegisteredPublicPortalAdapter(source.id)),
  );
  const selection = selectFairPortalSources(
    runtimeAuthorized,
    new Map(),
    2,
    new Set(runtimeAuthorized.map((source) => source.id)),
  );
  assert.deepEqual(
    selection.selected.map((source) => source.id),
    ["mn-swift"],
  );
  assert.equal(
    selection.deferred.some((source) => source.id === "ct-ctsource"),
    false,
  );
});

test("manual-only sources are removed from serialized active health", () => {
  const result = filterManualOnlyPortalHealth({
    health: {
      summary: {},
      sources: [
        {
          sourceId: "ct-ctsource",
          currentlyFailing: true,
          lastOutcome: "failed",
        },
        {
          sourceId: "nc-evp",
          currentlyFailing: true,
          lastOutcome: "failed",
        },
        {
          sourceId: "ca-solano-county",
          currentlyFailing: false,
          lastOutcome: "success",
        },
      ],
    },
  });
  assert.deepEqual(
    result.health.sources.map((status) => status.sourceId),
    ["ca-solano-county"],
  );
  assert.deepEqual(result.health.summary, {
    checked: 1,
    success: 1,
    noResults: 0,
    failing: 0,
    quarantined: 0,
    validationFailed: 0,
  });
});

test("legacy BSO tenants are replaced by listing-only Periscope recovery providers", () => {
  for (const id of ["ma-commbuys", "nv-epro", "nj-start"]) {
    assert.equal(
      bsoPortalProviders[id]?.constructor.name,
      "PeriscopeListingOnlyProvider",
    );
  }
});

test("manual-only epochs discard superseded health without touching newer rows", () => {
  for (const id of MANUAL_ONLY_PORTAL_IDS) {
    if (id === "nc-evp") continue;
    assert.equal(
      isSupersededPublicPortalHealth(
        healthStatus(id, "2026-07-23T21:25:00.000Z"),
      ),
      true,
      `${id} old failure is superseded`,
    );
    assert.equal(
      isSupersededPublicPortalHealth(
        healthStatus(id, "2026-07-23T23:30:00.000Z"),
      ),
      false,
      `${id} newer health remains valid`,
    );
  }

  assert.equal(
    isSupersededPublicPortalHealth(
      healthStatus("nc-evp", "2026-07-24T00:02:45.000Z"),
    ),
    false,
    "North Carolina is hidden by the manual-only health boundary without rewriting stored history",
  );
  assert.equal(
    isSupersededPublicPortalHealth(
      healthStatus("mn-swift", "2026-07-23T20:24:47.000Z"),
    ),
    true,
  );
  assert.equal(
    isSupersededPublicPortalHealth(
      healthStatus("ca-solano-county", "2026-07-23T20:00:00.000Z"),
    ),
    false,
  );
});
