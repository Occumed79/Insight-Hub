import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SocrataProvider } from "../socrata";
import { sourceDefinition } from "../../sourceArchitecture";

const originalFetch = globalThis.fetch;
const originalStructuredFlag = process.env.SOCRATA_STRUCTURED_ENABLED;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStructuredFlag == null) delete process.env.SOCRATA_STRUCTURED_ENABLED;
  else process.env.SOCRATA_STRUCTURED_ENABLED = originalStructuredFlag;
});

describe("Socrata structured procurement boundary", () => {
  it("never emits catalog dataset metadata as an opportunity", async () => {
    delete process.env.SOCRATA_STRUCTURED_ENABLED;
    const provider = new SocrataProvider();
    provider.search = async () => [
      {
        title: "Award Solicitations",
        description: "Daily list of active county contracts.",
        url: "https://data.montgomerycountymd.gov/d/ku39-t2wt",
        domain: "data.montgomerycountymd.gov",
        assetId: "ku39-t2wt",
        updatedAt: "2026-09-10T00:00:00.000Z",
      },
    ];

    const result = await provider.fetch({ keywords: "occupational health" });

    assert.equal(result.records.length, 0);
  });

  it("owns Socrata as a direct structured source, not browser discovery", () => {
    assert.equal(sourceDefinition("socrata")?.role, "direct_source");
  });

  it("queries curated live profiles and never queries forecast or award datasets in the opportunity provider", async () => {
    process.env.SOCRATA_STRUCTURED_ENABLED = "true";
    const provider = new SocrataProvider();
    (provider as any).credentials = async () => ({
      mode: "app-token",
      appToken: "test-token",
    });

    const requested: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      const target = String(url);
      requested.push(target);
      const rows = target.includes("/tf3b-tk9r/")
        ? [
            {
              request_id: "structured-1",
              agency_name: "DEPARTMENT OF CITYWIDE ADMINISTRATIVE SERVICES",
              type_of_notice_description: "Request for Proposals",
              short_title: "Employee Medical Examinations",
              additional_description_1:
                "Pre-employment physical examinations and medical surveillance for city employees.",
              pin: "85726P0001",
              start_date: "2026-09-10T00:00:00.000Z",
              due_date: "2026-10-15T14:00:00.000Z",
            },
          ]
        : [];
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await provider.fetch({ keywords: "occupational health" });

    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].externalId, "socrata:data.cityofnewyork.us:tf3b-tk9r:structured-1");
    assert.ok(requested.some((url) => url.includes("/hf3r-utnq/query.json")));
    assert.ok(requested.some((url) => url.includes("/eshn-8t3a/query.json")));
    assert.ok(requested.some((url) => url.includes("/eeq6-nnwe/query.json")));
    assert.ok(requested.some((url) => url.includes("/bzjf-rmtp/query.json")));
    assert.ok(requested.some((url) => url.includes("/tf3b-tk9r/query.json")));
    assert.ok(requested.some((url) => url.includes("/sr3n-9r9v/query.json")));
    assert.equal(requested.some((url) => url.includes("/p8e4-uwuv/query.json")), false);
    assert.equal(requested.some((url) => url.includes("/ku39-t2wt/query.json")), false);
    assert.equal(result.diagnostics?.datasetProfilesScanned, 6);
    assert.equal(result.diagnostics?.datasetRowsFetched, 1);
    assert.equal(result.diagnostics?.relevanceAccepted, 1);
  });
});
