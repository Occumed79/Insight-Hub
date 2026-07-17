import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BONFIRE_TENANTS,
  BONFIRE_COLLECTIBLE_PORTAL_IDS,
  BonfirePortalProvider,
  bonfireTenantProvider,
} from "../bonfirePortal";

// Realistic fixture based on the actual Bonfire API response format
const ACTIVE_FIXTURE = JSON.stringify({
  success: 1,
  message: "Success",
  payload: {
    projects: {
      "242844": {
        ProjectID: "242844",
        PrivateProjectID: "465007c0ea6a8a62103db5803679774a",
        ReferenceID: "2026-0701",
        ProjectStatusID: "2",
        ProjectSubStatusID: "1",
        ProjectVisibilityID: "1",
        ProjectName: "Palmyra Salt Shed Foundation",
        DateClose: "2026-07-23 15:00:00",
        DepartmentID: "7334",
      },
      "244159": {
        ProjectID: "244159",
        PrivateProjectID: "1fe975d88435adadedca637bbb5e2edd",
        ReferenceID: "2026-0702",
        ProjectStatusID: "2",
        ProjectSubStatusID: "1",
        ProjectVisibilityID: "1",
        ProjectName: "EMS Uniforms",
        DateClose: "2026-07-24 15:00:00",
        DepartmentID: "7334",
      },
    },
    departments: [],
  },
});

// A fixture with no projects (empty listing — simulates a closed/awarded scenario or off-peak)
const EMPTY_FIXTURE = JSON.stringify({
  success: 1,
  message: "Success",
  payload: { projects: {}, departments: [] },
});

// A fixture with a duplicate ProjectID to exercise dedup
const DUPLICATE_FIXTURE = JSON.stringify({
  success: 1,
  message: "Success",
  payload: {
    projects: {
      "242844": {
        ProjectID: "242844",
        ReferenceID: "2026-0701",
        ProjectName: "Palmyra Salt Shed Foundation",
        DateClose: "2026-07-23 15:00:00",
      },
    },
    departments: [],
  },
});

// Fixture with no DateClose (unknown deadline) and no DateOpen (unknown posted date)
const UNKNOWN_DATE_FIXTURE = JSON.stringify({
  success: 1,
  message: "Success",
  payload: {
    projects: {
      "999001": {
        ProjectID: "999001",
        ReferenceID: "2026-0999",
        ProjectName: "Occupational Health Services RFP",
        DateClose: "",
        DepartmentID: "7334",
      },
    },
    departments: [],
  },
});

const MONTGOMERY_TENANT = BONFIRE_TENANTS.find((t) => t.portalId === "tn-montgomery-county")!;

describe("Bonfire tenant configuration", () => {
  it("activates Montgomery County with concrete tenant slug", () => {
    assert.ok(MONTGOMERY_TENANT, "Montgomery County tenant must exist");
    assert.equal(MONTGOMERY_TENANT.tenantSlug, "mcgtn");
    assert.equal(MONTGOMERY_TENANT.buyerName, "Montgomery County");
    assert.equal(MONTGOMERY_TENANT.state, "TN");
    assert.equal(MONTGOMERY_TENANT.listingUrl, "https://mcgtn.bonfirehub.com/opportunities");
    assert.equal(MONTGOMERY_TENANT.origin, "https://mcgtn.bonfirehub.com");
  });

  it("registers Montgomery County as a collectible portal ID", () => {
    assert.ok(BONFIRE_COLLECTIBLE_PORTAL_IDS.has("tn-montgomery-county"));
  });

  it("creates a provider for Montgomery County via tenant factory", () => {
    const provider = bonfireTenantProvider("tn-montgomery-county");
    assert.ok(provider, "Provider must be created for a known tenant");
    assert.equal(bonfireTenantProvider("nonexistent-portal"), undefined);
  });
});

describe("Bonfire public opportunities adapter", () => {
  it("parses active opportunities and produces stable tenant-scoped IDs", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(ACTIVE_FIXTURE, { status: 200, headers: { "content-type": "application/json" } });
    try {
      const provider = new BonfirePortalProvider([MONTGOMERY_TENANT]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.errors.length, 0);
      assert.equal(result.records.length, 2);

      const first = result.records[0];
      assert.ok(first, "First record must exist");
      assert.equal(first.externalId, "bonfire-mcgtn-242844");
      assert.equal(first.agency, "Montgomery County");
      assert.equal(first.status, "active");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("populates required technical-platform metadata", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(ACTIVE_FIXTURE, { status: 200, headers: { "content-type": "application/json" } });
    try {
      const provider = new BonfirePortalProvider([MONTGOMERY_TENANT]);
      const result = await provider.fetch({ limit: 10 });
      const record = result.records[0];
      assert.ok(record, "Record must exist");
      assert.equal(record.rawData?.providerPlatform, "bonfire_euna");
      assert.equal(record.rawData?.tenantSlugOrId, "mcgtn");
      assert.equal(record.rawData?.sourceId, "tn-montgomery-county");
      assert.ok(typeof record.rawData?.nativeOpportunityId === "string");
      assert.ok(typeof record.rawData?.listingUrl === "string");
      assert.ok(typeof record.rawData?.canonicalUrl === "string");
      assert.ok(typeof record.rawData?.collectedAt === "string");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses unknown-date convention when DateOpen is absent", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(UNKNOWN_DATE_FIXTURE, { status: 200, headers: { "content-type": "application/json" } });
    try {
      const provider = new BonfirePortalProvider([MONTGOMERY_TENANT]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.errors.length, 0);
      const record = result.records[0];
      assert.ok(record, "Record must exist");
      assert.equal(record.postedDate.getTime(), 0, "Unknown posted date must be new Date(0)");
      assert.equal(record.rawData?.dateUnknown, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns empty records for an empty listing without error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(EMPTY_FIXTURE, { status: 200, headers: { "content-type": "application/json" } });
    try {
      const provider = new BonfirePortalProvider([MONTGOMERY_TENANT]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.records.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("removes duplicate opportunity IDs", async () => {
    const originalFetch = globalThis.fetch;
    // Return the same single project twice by calling fetch twice and aggregating
    // (Provider-level dedup via seen set)
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount += 1;
      return new Response(DUPLICATE_FIXTURE, { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      // Two tenants with the same listing would produce duplicates at provider level
      const tenantA = { ...MONTGOMERY_TENANT };
      const tenantB = { ...MONTGOMERY_TENANT, portalId: "tn-montgomery-county-2", tenantSlug: "mcgtn" };
      const provider = new BonfirePortalProvider([tenantA, tenantB]);
      const result = await provider.fetch({ limit: 10 });
      // Both tenants return project 242844; the externalId is the same so dedup removes one
      const ids = result.records.map((r) => r.externalId);
      const uniqueIds = new Set(ids);
      assert.equal(ids.length, uniqueIds.size, "No duplicate external IDs must appear");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns empty documentUrls array (Bonfire documents require login)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(ACTIVE_FIXTURE, { status: 200, headers: { "content-type": "application/json" } });
    try {
      const provider = new BonfirePortalProvider([MONTGOMERY_TENANT]);
      const result = await provider.fetch({ limit: 10 });
      const record = result.records[0];
      assert.ok(Array.isArray(record?.rawData?.documentUrls));
      assert.equal((record?.rawData?.documentUrls as string[]).length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
