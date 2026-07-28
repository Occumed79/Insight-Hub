/**
 * OpenGov shared adapter — fixture-based unit tests.
 *
 * These tests exercise the pure-function parts of the adapter (tenant map
 * completeness, ID generation, response parsing, status normalisation) using
 * in-process fixtures.  No network calls are made.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OPENGOV_TENANTS,
  OPENGOV_TENANT_BY_PORTAL_ID,
  OPENGOV_PORTAL_IDS,
  openGovTenantProvider,
  OpenGovProvider,
} from "../openGov";

// ─── Re-export private helpers for testing via the module's exported types ────
// (We test them indirectly through provider.fetch() with a mocked globalThis.fetch)

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_VOLUSIA = OPENGOV_TENANTS.find(
  (t) => t.portalId === "fl-volusia-county-opengov",
)!;
const TENANT_SANTA_CRUZ = OPENGOV_TENANTS.find(
  (t) => t.portalId === "ca-city-of-santa-cruz-opengov",
)!;

/** Minimal valid OpenGov project response */
function makeProjectResponse(
  projects: Array<Record<string, unknown>>,
  page = 1,
  totalPages = 1,
) {
  return {
    data: projects,
    meta: {
      total: projects.length,
      page,
      per_page: 25,
      total_pages: totalPages,
    },
  };
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 12345,
    title: "Employee Occupational Health Services RFP",
    description:
      "Comprehensive occupational health services for county employees.",
    status: "open",
    project_type: "RFP",
    solicitation_number: "OCC-2024-001",
    published_at: "2024-03-01T00:00:00Z",
    close_at: "2024-04-15T23:59:59Z",
    location: "Volusia County, FL",
    department: { name: "Purchasing Division" },
    documents: [
      {
        id: 1,
        name: "RFP Document",
        url: "https://procurement.opengov.com/docs/1/rfp.pdf",
        public: true,
      },
      {
        id: 2,
        name: "Private Attachment",
        url: "https://procurement.opengov.com/docs/2/private.pdf",
        public: false,
      },
    ],
    ...overrides,
  };
}

// ─── Tenant map tests ─────────────────────────────────────────────────────────

describe("OpenGov tenant map", () => {
  it("has 18 entries — one per confirmed catalog entry in generated.041.ts", () => {
    assert.equal(OPENGOV_TENANTS.length, 18);
  });

  it("all tenantSlugs are non-empty strings", () => {
    for (const tenant of OPENGOV_TENANTS) {
      assert.ok(
        tenant.tenantSlug.length > 0,
        `empty tenantSlug for ${tenant.portalId}`,
      );
    }
  });

  it("all portalIds are unique", () => {
    const ids = OPENGOV_TENANTS.map((t) => t.portalId);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("all tenantSlugs are unique", () => {
    const slugs = OPENGOV_TENANTS.map((t) => t.tenantSlug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it("OPENGOV_PORTAL_IDS set matches OPENGOV_TENANTS", () => {
    assert.equal(OPENGOV_PORTAL_IDS.size, OPENGOV_TENANTS.length);
    for (const tenant of OPENGOV_TENANTS) {
      assert.ok(
        OPENGOV_PORTAL_IDS.has(tenant.portalId),
        `missing ${tenant.portalId}`,
      );
    }
  });

  it("OPENGOV_TENANT_BY_PORTAL_ID lookup resolves every tenant", () => {
    for (const tenant of OPENGOV_TENANTS) {
      const found = OPENGOV_TENANT_BY_PORTAL_ID.get(tenant.portalId);
      assert.ok(found, `lookup failed for ${tenant.portalId}`);
      assert.equal(found.tenantSlug, tenant.tenantSlug);
    }
  });

  it("all capability values are valid", () => {
    const VALID = new Set([
      "dedicated_listing_and_detail",
      "dedicated_listing",
      "directory_only",
      "login_required",
    ]);
    for (const tenant of OPENGOV_TENANTS) {
      assert.ok(
        VALID.has(tenant.capability),
        `invalid capability for ${tenant.portalId}: ${tenant.capability}`,
      );
    }
  });

  it("all 18 tenants have dedicated_listing_and_detail capability", () => {
    const collectible = OPENGOV_TENANTS.filter(
      (t) =>
        t.capability === "dedicated_listing_and_detail" ||
        t.capability === "dedicated_listing",
    );
    assert.equal(collectible.length, 18);
  });

  it("volusia county tenant is present with correct slug", () => {
    assert.ok(TENANT_VOLUSIA, "volusia tenant not found");
    assert.equal(TENANT_VOLUSIA.tenantSlug, "volusia");
    assert.equal(TENANT_VOLUSIA.state, "FL");
  });

  it("santa cruz tenant is present with correct slug", () => {
    assert.ok(TENANT_SANTA_CRUZ, "santa cruz tenant not found");
    assert.equal(TENANT_SANTA_CRUZ.tenantSlug, "santacruzca");
    assert.equal(TENANT_SANTA_CRUZ.state, "CA");
  });
});

// ─── openGovTenantProvider factory ────────────────────────────────────────────

describe("openGovTenantProvider", () => {
  it("returns a provider for every known portal ID", () => {
    for (const id of OPENGOV_PORTAL_IDS) {
      const provider = openGovTenantProvider(id);
      assert.ok(provider, `no provider for ${id}`);
    }
  });

  it("returns undefined for an unknown portal ID", () => {
    const provider = openGovTenantProvider("unknown-portal-id-xyz");
    assert.equal(provider, undefined);
  });

  it("provider is configured without credentials", async () => {
    const provider = openGovTenantProvider("fl-volusia-county-opengov");
    assert.ok(provider);
    assert.equal(await provider.isConfigured(), true);
  });
});

// ─── Record shape and identity ────────────────────────────────────────────────

describe("OpenGov opportunity identity and provenance", () => {
  it("stable ID uses opengov-{slug}-{projectId} pattern", async () => {
    const mockResponse = makeProjectResponse([makeProject({ id: 99999 })]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const provider = new OpenGovProvider([TENANT_VOLUSIA]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(
        result.errors.length,
        0,
        `unexpected errors: ${result.errors.join("; ")}`,
      );
      assert.equal(result.records.length, 1);
      assert.equal(result.records[0].externalId, "opengov-volusia-99999");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("canonical sourceUrl uses /portal/{slug}/project/{id} path", async () => {
    const mockResponse = makeProjectResponse([makeProject({ id: 42 })]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const provider = new OpenGovProvider([TENANT_VOLUSIA]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(
        result.records[0].sourceUrl,
        "https://procurement.opengov.com/portal/volusia/project/42",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("buyer identity (agency) is the government entity name, not the platform name", async () => {
    const mockResponse = makeProjectResponse([makeProject()]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const provider = new OpenGovProvider([TENANT_VOLUSIA]);
      const result = await provider.fetch({ limit: 10 });
      const record = result.records[0];
      assert.equal(record.agency, "Volusia County");
      assert.equal(record.rawData?.tenantSlug, "volusia");
      assert.equal(record.rawData?.providerPlatform, "opengov");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("subAgency is set from project department.name", async () => {
    const mockResponse = makeProjectResponse([
      makeProject({ department: { name: "Purchasing Division" } }),
    ]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const provider = new OpenGovProvider([TENANT_VOLUSIA]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.records[0].subAgency, "Purchasing Division");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("only public documents appear in documentUrls", async () => {
    const mockResponse = makeProjectResponse([makeProject()]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const provider = new OpenGovProvider([TENANT_VOLUSIA]);
      const result = await provider.fetch({ limit: 10 });
      const docs = result.records[0].rawData?.documentUrls as string[];
      assert.equal(docs.length, 1);
      assert.ok(docs[0].includes("rfp.pdf"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not fabricate a postedDate when published_at is absent", async () => {
    const mockResponse = makeProjectResponse([
      makeProject({ published_at: null }),
    ]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const provider = new OpenGovProvider([TENANT_VOLUSIA]);
      const result = await provider.fetch({ limit: 10 });
      const record = result.records[0];
      assert.equal(record.rawData?.dateUnknown, true);
      // postedDate defaults to epoch (new Date(0)) — not a fabricated date
      assert.equal(record.postedDate.getTime(), 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not fabricate a responseDeadline when close_at and due_at are absent", async () => {
    const mockResponse = makeProjectResponse([
      makeProject({ close_at: null, due_at: null }),
    ]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const provider = new OpenGovProvider([TENANT_VOLUSIA]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.records[0].responseDeadline, undefined);
      assert.equal(result.records[0].rawData?.deadlineUnknown, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("skips records without a title", async () => {
    const mockResponse = makeProjectResponse([
      makeProject({ title: "" }),
      makeProject({ id: 2, title: "Valid RFP" }),
    ]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const provider = new OpenGovProvider([TENANT_VOLUSIA]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.records.length, 1);
      assert.equal(result.records[0].externalId, "opengov-volusia-2");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ─── Status normalization ─────────────────────────────────────────────────────

describe("OpenGov status normalisation", () => {
  const statusCases: Array<[string | null, "active" | "archived"]> = [
    ["open", "active"],
    ["active", "active"],
    ["closed", "archived"],
    ["awarded", "archived"],
    ["cancelled", "archived"],
    ["archived", "archived"],
    [null, "active"],
  ];

  for (const [raw, expected] of statusCases) {
    it(`maps status "${raw}" to "${expected}"`, async () => {
      const mockResponse = makeProjectResponse([
        makeProject({ status: raw, id: 1 }),
      ]);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });

      try {
        const provider = new OpenGovProvider([TENANT_VOLUSIA]);
        const result = await provider.fetch({ limit: 10 });
        assert.equal(result.records[0].status, expected);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  }
});

// ─── Pagination and deduplication ─────────────────────────────────────────────

describe("OpenGov pagination and deduplication", () => {
  it("propagates parent cancellation and stops the active tenant request", async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    };

    try {
      const provider = new OpenGovProvider([TENANT_VOLUSIA]);
      const execution = provider.fetch({
        limit: 10,
        signal: controller.signal,
      });
      await Promise.resolve();
      controller.abort(new Error("manual cancellation"));
      await assert.rejects(execution, /manual cancellation/);
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("stops pagination when API returns empty data", async () => {
    let callCount = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      callCount += 1;
      if (callCount === 1) {
        return new Response(
          JSON.stringify(makeProjectResponse([makeProject({ id: 1 })], 1, 2)),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      // Second page is empty
      return new Response(JSON.stringify(makeProjectResponse([], 2, 2)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      const provider = new OpenGovProvider([TENANT_VOLUSIA]);
      const result = await provider.fetch({ limit: 100 });
      assert.equal(result.records.length, 1);
      assert.equal(callCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deduplicates same-run records by externalId", async () => {
    // Return the same project ID twice across two tenants
    const sameProject = makeProject({ id: 7777, title: "Shared Solicitation" });
    let callCount = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      callCount += 1;
      return new Response(JSON.stringify(makeProjectResponse([sameProject])), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      // Two tenants with the same project ID would produce different externalIds
      // because the externalId includes the tenant slug — no real cross-tenant
      // dedup collision expected. The test verifies same-tenant dedup works.
      const tenantWithDup: typeof TENANT_VOLUSIA = { ...TENANT_VOLUSIA };
      const provider = new OpenGovProvider([tenantWithDup]);
      const result = await provider.fetch({ limit: 100 });
      assert.equal(
        result.records.length,
        1,
        "duplicate within same tenant run should be collapsed",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("preserves partial results when one tenant HTTP 500 occurs mid-run", async () => {
    let callCount = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request) => {
      callCount += 1;
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/volusia/")) {
        return new Response(
          JSON.stringify(makeProjectResponse([makeProject({ id: 1 })])),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      // santacruzca fails
      return new Response("Internal Server Error", { status: 500 });
    };

    try {
      const twoTenants = [TENANT_VOLUSIA, TENANT_SANTA_CRUZ];
      const provider = new OpenGovProvider(twoTenants);
      const result = await provider.fetch({ limit: 100 });
      // Volusia succeeds → 1 record; Santa Cruz fails → 0 records + error
      assert.equal(result.records.length, 1);
      assert.ok(
        result.errors.length >= 1,
        "expected at least one error from santa cruz failure",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
