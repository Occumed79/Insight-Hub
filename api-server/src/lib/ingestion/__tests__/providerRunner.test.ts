import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { providerRegistry } = await import("../../providers");
const { fetchOneProvider } = await import("../providerRunner");

test("public portal runner executes the registry-backed provider once and propagates adapter progress", async () => {
  const originalProvider = providerRegistry.publicPortalProviders;
  const originalFetch = globalThis.fetch;
  let providerFetches = 0;
  const progress: string[] = [];

  providerRegistry.publicPortalProviders = {
    name: "publicPortalProviders",
    async isConfigured() {
      return true;
    },
    async fetch(options) {
      providerFetches += 1;
      await options.onProgress?.({
        provider: "publicPortalProviders",
        phase: "source_start",
        sourceId: "example-county",
        sourceName: "Example County",
        index: 1,
        total: 1,
      });
      await options.onProgress?.({
        provider: "publicPortalProviders",
        phase: "source_complete",
        sourceId: "example-county",
        sourceName: "Example County",
        index: 1,
        total: 1,
        recordCount: 1,
      });
      return {
        records: [
          {
            externalId: "single-runtime-record",
            title: "Occupational Health Services",
            agency: "Example County",
            type: "RFP",
            status: "active",
            postedDate: new Date("2026-07-01T00:00:00.000Z"),
            responseDeadline: new Date("2099-08-01T00:00:00.000Z"),
            sourceUrl: "https://example.gov/bids/1",
            source: "publicPortalProviders",
          },
        ],
        total: 1,
        errors: [],
      };
    },
    async getStatus() {
      return {
        name: "publicPortalProviders",
        configured: true,
        healthy: true,
      };
    },
  };

  globalThis.fetch = (async () => {
    throw new Error("unexpected second network execution");
  }) as typeof fetch;

  try {
    const result = await fetchOneProvider("publicPortalProviders", {
      keywords: "occupational health",
      dateRange: 365,
      onProgress: (event) => {
        progress.push(`${event.phase}:${event.sourceId}`);
      },
    });
    assert.equal(providerFetches, 1);
    assert.equal(result.records.length, 1);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(progress, [
      "source_start:example-county",
      "source_complete:example-county",
    ]);
  } finally {
    providerRegistry.publicPortalProviders = originalProvider;
    globalThis.fetch = originalFetch;
  }
});
