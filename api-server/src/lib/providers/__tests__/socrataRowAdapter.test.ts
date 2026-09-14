import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SOCRATA_DATASET_PROFILES } from "../socrataDatasetProfiles";
import {
  normalizeSocrataRow,
  querySocrataDataset,
} from "../socrataRowAdapter";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function profile(key: string) {
  const found = SOCRATA_DATASET_PROFILES.find((item) => item.key === key);
  assert.ok(found, `missing profile ${key}`);
  return found;
}

const now = new Date("2026-09-14T12:00:00.000Z");

describe("Socrata SODA3 row adapter", () => {
  it("normalizes a live medically relevant NYC bid with stable provenance", () => {
    const decision = normalizeSocrataRow(
      profile("nyc-current-bids"),
      {
        request_id: "20260914001",
        agency_name: "DEPARTMENT OF CITYWIDE ADMINISTRATIVE SERVICES",
        type_of_notice_description: "Request for Proposals",
        short_title: "Employee Medical Examinations",
        additional_description_1:
          "Pre-employment physical examinations, medical surveillance, audiometry and spirometry for city employees.",
        pin: "85726P0001",
        start_date: "2026-09-10T00:00:00.000",
        due_date: "2026-10-15T14:00:00.000",
        source_url: "https://www.nyc.gov/site/dcas/business/opportunities.page",
      },
      now,
    );

    assert.equal(decision.reason, null);
    assert.ok(decision.record);
    assert.equal(
      decision.record.externalId,
      "socrata:data.cityofnewyork.us:tf3b-tk9r:20260914001",
    );
    assert.equal(decision.record.source, "socrata");
    assert.equal(decision.record.providerName, "socrata");
    assert.equal(decision.record.title, "Employee Medical Examinations");
    assert.equal(decision.record.solicitationNumber, "85726P0001");
    assert.equal(decision.record.status, "active");
    assert.equal(decision.record.responseDeadline?.toISOString(), "2026-10-15T14:00:00.000Z");
    assert.equal(decision.record.rawData?.sourceConfidence, "high");
    const provenance = decision.record.rawData?.socrata as Record<string, unknown>;
    assert.equal(provenance.domain, "data.cityofnewyork.us");
    assert.equal(provenance.datasetId, "tf3b-tk9r");
    assert.equal(provenance.datasetClass, "live_solicitations");
  });

  it("uses trusted feed context without letting generic construction through", () => {
    const decision = normalizeSocrataRow(
      profile("nyc-current-bids"),
      {
        request_id: "construction-1",
        agency_name: "DEPARTMENT OF TRANSPORTATION",
        type_of_notice_description: "Request for Proposals",
        short_title: "Bridge Rehabilitation",
        additional_description_1: "Concrete paving, structural steel and roadway construction.",
        start_date: "2026-09-10T00:00:00.000",
        due_date: "2026-10-15T14:00:00.000",
      },
      now,
    );

    assert.equal(decision.record, null);
    assert.equal(decision.reason, "irrelevant");
  });

  it("rejects an expired live row before it can enter opportunity ingestion", () => {
    const decision = normalizeSocrataRow(
      profile("nyc-current-bids"),
      {
        request_id: "expired-1",
        agency_name: "DCAS",
        type_of_notice_description: "Request for Proposals",
        short_title: "Occupational Health Services",
        additional_description_1: "Medical surveillance and employee physical examinations.",
        start_date: "2026-08-01T00:00:00.000",
        due_date: "2026-09-01T14:00:00.000",
      },
      now,
    );

    assert.equal(decision.record, null);
    assert.equal(decision.reason, "expired");
  });

  it("never emits an awards/intelligence profile through the live-opportunity adapter", () => {
    const decision = normalizeSocrataRow(
      profile("montgomery-award-solicitations"),
      {
        id: "award-1",
        agency: "Montgomery County",
        title: "Occupational Health Services",
        description: "Employee medical surveillance services.",
        due_date: "2026-10-15T14:00:00.000",
      },
      now,
    );

    assert.equal(decision.record, null);
    assert.equal(decision.reason, "wrong_dataset_class");
  });

  it("POSTs bounded SoQL to the SODA3 row endpoint with the application token", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify([{ request_id: "row-1" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const rows = await querySocrataDataset(
      profile("nyc-current-bids"),
      { "X-App-Token": "test-token" },
      { pageSize: 125 },
    );

    assert.equal(rows.length, 1);
    assert.equal(
      capturedUrl,
      "https://data.cityofnewyork.us/api/v3/views/tf3b-tk9r/query.json",
    );
    assert.equal(capturedInit?.method, "POST");
    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get("X-App-Token"), "test-token");
    assert.equal(headers.get("Content-Type"), "application/json");
    const body = JSON.parse(String(capturedInit?.body));
    assert.equal(body.page.pageNumber, 1);
    assert.equal(body.page.pageSize, 125);
    assert.equal(body.includeSynthetic, false);
    assert.match(body.query, /^SELECT \*/);
  });
});
