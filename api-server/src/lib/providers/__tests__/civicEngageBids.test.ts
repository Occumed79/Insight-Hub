import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CIVICENGAGE_PORTAL_IDS,
  CIVICENGAGE_TENANTS,
  CivicEngageBidsProvider,
  civicEngageTenantProvider,
  parseCivicEngageDetailHtml,
  parseCivicEngageListingHtml,
} from "../civicEngageBids";
import {
  isDedicatedPublicPortalSourceId,
  publicPortalProvidersProvider,
} from "../publicPortalProviders/index";
import { portalConnectorCapability } from "../portalCapabilities";

const TENANT = CIVICENGAGE_TENANTS.find((tenant) => tenant.portalId === "wa-franklin-county")!;
const FUTURE_CLOSE = "12/31/2099 4:00 PM";

function listingFixture(options: {
  duplicate?: boolean;
  includeClosed?: boolean;
  includeNext?: boolean;
  unknownDates?: boolean;
  externalDetail?: boolean;
} = {}): string {
  const active = `
    <tr class="bid-row">
      <td><a href="/Bids.aspx?BidID=321">Occupational Health Services RFP</a></td>
      <td>Bid Number: RFP-2099-001</td>
      <td>Category: Human Resources</td>
      <td>Status: Open</td>
      ${options.unknownDates ? "" : `<td>Publication Date: 1/2/2099</td><td>Closing Date: ${FUTURE_CLOSE}</td>`}
    </tr>`;
  const closed = options.includeClosed ? `
    <tr class="bid-row">
      <td><a href="/Bids.aspx?BidID=111">Closed Equipment Bid</a></td>
      <td>Bid Number: ITB-111</td>
      <td>Status: Awarded</td>
      <td>Closing Date: 1/1/2020</td>
    </tr>` : "";
  const duplicate = options.duplicate ? active : "";
  const external = options.externalDetail
    ? `<tr><td><a href="https://example.com/Bids.aspx?BidID=999">External Bid</a></td></tr>`
    : "";
  const next = options.includeNext
    ? `<nav class="pagination"><a class="page-link next" rel="next" href="/Bids.aspx?CatID=19&page=2">Next</a></nav>`
    : "";
  return `<html><body><table>${active}${duplicate}${closed}${external}</table>${next}</body></html>`;
}

const DETAIL_FIXTURE = `
<html><body>
  <h1>Occupational Health Services RFP</h1>
  <div>Bid Number: RFP-2099-001</div>
  <div>Category: Human Resources</div>
  <div>Status: Open</div>
  <div>Publication Date: 1/2/2099</div>
  <div>Opening Date: 1/3/2099</div>
  <div>Closing Date: ${FUTURE_CLOSE}</div>
  <div>Description: Provide occupational health examinations, respirator clearances, and related services.</div>
  <div>Contact Name: Jordan Buyer</div>
  <div>Email: jordan@example.gov</div>
  <div>Phone: (555) 555-1212</div>
  <div>Pre-Bid Meeting: Virtual meeting on February 1.</div>
  <a href="/DocumentCenter/View/100/specifications.pdf">Specifications</a>
  <a href="/DocumentCenter/View/101/addendum-1.pdf">Addendum 1</a>
  <a href="/DocumentCenter/View/101/addendum-1.pdf">Addendum 1 duplicate</a>
  <a href="https://example.com/external.pdf">External attachment</a>
</body></html>`;

function response(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

describe("CivicEngage source manifest", () => {
  it("registers exactly the 50 supplied buyers", () => {
    assert.equal(CIVICENGAGE_TENANTS.length, 50);
    assert.equal(CIVICENGAGE_PORTAL_IDS.size, 50);
    assert.equal(new Set(CIVICENGAGE_TENANTS.map((tenant) => tenant.portalId)).size, 50);
  });

  it("uses concrete tenant-scoped providers for every manifest entry", () => {
    for (const tenant of CIVICENGAGE_TENANTS) {
      assert.ok(civicEngageTenantProvider(tenant.portalId), `missing provider for ${tenant.portalId}`);
      assert.equal(new URL(tenant.listingUrl).origin, tenant.origin);
    }
    assert.equal(civicEngageTenantProvider("not-a-civicengage-source"), undefined);
  });

  it("preserves category query parameters in the supplied URLs", () => {
    assert.equal(
      TENANT.listingUrl,
      "https://franklincountywa.gov/Bids.aspx?CatID=19",
    );
    const cowlitz = CIVICENGAGE_TENANTS.find((tenant) => tenant.portalId === "wa-cowlitz-county")!;
    assert.equal(new URL(cowlitz.listingUrl).searchParams.get("CatID"), "All");
    assert.equal(new URL(cowlitz.listingUrl).searchParams.get("showAllBids"), "on");
  });

  it("registers all 50 as dedicated sources and excludes generic execution", () => {
    const runtimeSources = new Map(publicPortalProvidersProvider.getSources().map((source) => [source.id, source]));
    for (const portalId of CIVICENGAGE_PORTAL_IDS) {
      assert.ok(runtimeSources.has(portalId), `runtime source missing ${portalId}`);
      assert.equal(isDedicatedPublicPortalSourceId(portalId), true);
    }
  });

  it("reports direct-adapter capability for all 50 source IDs", () => {
    for (const tenant of CIVICENGAGE_TENANTS) {
      const capability = portalConnectorCapability({
        id: tenant.portalId,
        country: "US",
        level: "district",
        accessMode: "public_html",
      });
      assert.equal(capability.connectorStatus, "direct_adapter");
      assert.equal(capability.requiresSerper, false);
    }
  });
});

describe("CivicEngage listing parser", () => {
  it("parses a standard active listing", () => {
    const records = parseCivicEngageListingHtml(listingFixture(), TENANT);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.nativeBidId, "321");
    assert.equal(records[0]?.title, "Occupational Health Services RFP");
    assert.equal(records[0]?.solicitationNumber, "RFP-2099-001");
    assert.equal(records[0]?.category, "Human Resources");
  });

  it("returns no records for an empty listing", () => {
    const records = parseCivicEngageListingHtml(
      `<html><body><p>There are no open bid postings at this time.</p></body></html>`,
      TENANT,
    );
    assert.deepEqual(records, []);
  });

  it("excludes closed records while retaining active records", () => {
    const records = parseCivicEngageListingHtml(listingFixture({ includeClosed: true }), TENANT);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.nativeBidId, "321");
  });

  it("deduplicates repeated listing rows", () => {
    const records = parseCivicEngageListingHtml(listingFixture({ duplicate: true }), TENANT);
    assert.equal(records.length, 1);
  });

  it("rejects cross-origin detail links", () => {
    const records = parseCivicEngageListingHtml(listingFixture({ externalDetail: true }), TENANT);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.canonicalUrl, "https://franklincountywa.gov/Bids.aspx?BidID=321");
  });
});

describe("CivicEngage detail parser", () => {
  it("extracts detail fields, contact data, and pre-bid information", () => {
    const detail = parseCivicEngageDetailHtml(
      DETAIL_FIXTURE,
      TENANT,
      "https://franklincountywa.gov/Bids.aspx?BidID=321",
    );
    assert.equal(detail.title, "Occupational Health Services RFP");
    assert.equal(detail.solicitationNumber, "RFP-2099-001");
    assert.equal(detail.category, "Human Resources");
    assert.match(detail.description ?? "", /occupational health examinations/i);
    assert.equal(detail.contactEmail, "jordan@example.gov");
    assert.equal(detail.contactPhone, "(555) 555-1212");
    assert.match(detail.preBidInformation ?? "", /Virtual meeting/i);
  });

  it("extracts and deduplicates same-origin documents and addenda", () => {
    const detail = parseCivicEngageDetailHtml(
      DETAIL_FIXTURE,
      TENANT,
      "https://franklincountywa.gov/Bids.aspx?BidID=321",
    );
    assert.deepEqual(detail.documentUrls.sort(), [
      "https://franklincountywa.gov/DocumentCenter/View/100/specifications.pdf",
      "https://franklincountywa.gov/DocumentCenter/View/101/addendum-1.pdf",
    ]);
  });
});

describe("CivicEngage provider behavior", () => {
  it("produces a stable tenant-scoped ID and buyer/platform metadata", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      return response(url.includes("BidID=321") ? DETAIL_FIXTURE : listingFixture());
    };
    try {
      const provider = new CivicEngageBidsProvider([TENANT]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.errors.length, 0);
      assert.equal(result.records.length, 1);
      const record = result.records[0]!;
      assert.equal(record.externalId, "civicengage-wa-franklin-county-321");
      assert.equal(record.agency, "Franklin County");
      assert.equal(record.rawData?.providerPlatform, "civicengage_bids");
      assert.equal(record.rawData?.sourceId, "wa-franklin-county");
      assert.equal(record.rawData?.tenantSlugOrId, "franklincountywa.gov");
      assert.equal(record.rawData?.dateUnknown, false);
      assert.equal(record.rawData?.deadlineUnknown, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps unknown dates unknown instead of inserting today", async () => {
    const originalFetch = globalThis.fetch;
    const unknownDetail = `<html><body><h1>Occupational Health Services RFP</h1><div>Status: Open</div></body></html>`;
    globalThis.fetch = async (input) => response(String(input).includes("BidID=321") ? unknownDetail : listingFixture({ unknownDates: true }));
    try {
      const provider = new CivicEngageBidsProvider([TENANT]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.records.length, 1);
      const record = result.records[0]!;
      assert.equal(record.postedDate.getTime(), 0);
      assert.equal(record.responseDeadline, undefined);
      assert.equal(record.rawData?.dateUnknown, true);
      assert.equal(record.rawData?.deadlineUnknown, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retains the exact category-filtered listing URL on the first request", async () => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      requested.push(url);
      return response(url.includes("BidID=321") ? DETAIL_FIXTURE : listingFixture());
    };
    try {
      const provider = new CivicEngageBidsProvider([TENANT]);
      await provider.fetch({ limit: 10 });
      assert.equal(requested[0], TENANT.listingUrl);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("prevents repeated-page loops and duplicate output", async () => {
    const originalFetch = globalThis.fetch;
    let listingFetches = 0;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("BidID=321")) return response(DETAIL_FIXTURE);
      listingFetches += 1;
      return response(listingFixture({ includeNext: true }));
    };
    try {
      const provider = new CivicEngageBidsProvider([TENANT]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.records.length, 1);
      assert.equal(listingFetches, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns partial records when a later listing page fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("BidID=321")) return response(DETAIL_FIXTURE);
      if (url.includes("page=2")) throw new Error("simulated later-page failure");
      return response(listingFixture({ includeNext: true }));
    };
    try {
      const provider = new CivicEngageBidsProvider([TENANT]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.records.length, 1);
      assert.ok(result.errors.some((error) => /partial listing results/i.test(error)));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
