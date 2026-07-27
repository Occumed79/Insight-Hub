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
const { DELETED_PORTAL_IDS } = await import("../deletedPortalPolicy");
const { getRegisteredPublicPortalAdapter } = await import(
  "../publicPortalAdapterRegistry"
);
const { PUBLIC_PORTAL_SOURCES } = await import("../publicPortalProviders/catalog");
const { selectFairPortalSources } = await import(
  "../publicPortalProviders/portalHealthStore"
);
const { STATEWIDE_PROCUREMENT_SOURCES } = await import(
  "../statewideProcurementConfigs"
);

const sourceById = new Map(
  DEEP_RECOVERY_SOURCES.map((source) => [source.id, source]),
);
const statewideSourceById = new Map(
  STATEWIDE_PROCUREMENT_SOURCES.map((source) => [source.id, source]),
);

test("production recovery keeps only real runnable source implementations", () => {
  const ids = DEEP_RECOVERY_SOURCES.map((source) => source.id);
  assert.equal(ids.length, new Set(ids).size);

  for (const id of [
    "fl-vbs",
    "la-lapac",
    "in-idoa",
    "pa-emarketplace",
    "ak-iris-vss",
    "ut-purchasing",
    "mn-swift",
  ]) {
    assert.ok(sourceById.has(id), `${id} recovery source is registered`);
    assert.ok(deepRecoveryProviders[id], `${id} recovery provider is registered`);
    assert.ok(getRegisteredPublicPortalAdapter(id), `${id} is runtime-authorized`);
  }
});

test("deleted and formerly manual-only sources are absent everywhere", () => {
  const publicIds = new Set(PUBLIC_PORTAL_SOURCES.map((source) => source.id));

  for (const id of DELETED_PORTAL_IDS) {
    assert.equal(sourceById.has(id), false, `${id} removed from deep recovery sources`);
    assert.equal(Boolean(deepRecoveryProviders[id]), false, `${id} provider deleted`);
    assert.equal(statewideSourceById.has(id), false, `${id} removed from statewide inventory`);
    assert.equal(publicIds.has(id), false, `${id} removed from public catalogue`);
    assert.equal(
      getRegisteredPublicPortalAdapter(id),
      undefined,
      `${id} removed from adapter registry`,
    );
  }
});

test("published recovery sources are enabled and verified", () => {
  assert.ok(DEEP_RECOVERY_SOURCES.length > 0);
  assert.ok(
    DEEP_RECOVERY_SOURCES.every(
      (source) => source.enabled && source.verificationStatus === "verified",
    ),
  );
  assert.ok(
    STATEWIDE_PROCUREMENT_SOURCES.every(
      (source) => source.enabled && source.verificationStatus === "verified",
    ),
  );
});

test("deleted sources cannot enter fair rotation", () => {
  const active = sourceById.get("mn-swift");
  assert.ok(active);

  const candidates = [active].filter((source) =>
    Boolean(getRegisteredPublicPortalAdapter(source.id)),
  );
  const selection = selectFairPortalSources(
    candidates,
    new Map(),
    2,
    new Set(candidates.map((source) => source.id)),
  );
  assert.deepEqual(
    selection.selected.map((source) => source.id),
    ["mn-swift"],
  );
  assert.ok(
    selection.selected.every(
      (source) => !DELETED_PORTAL_IDS.has(source.id),
    ),
  );
});

test("deleted historical health rows are stripped from serialized health", () => {
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

test("legacy BSO tenants use real listing-only Periscope recovery providers", () => {
  for (const id of ["ma-commbuys", "nv-epro", "nj-start"]) {
    assert.equal(
      bsoPortalProviders[id]?.constructor.name,
      "PeriscopeListingOnlyProvider",
    );
  }
});
