import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STATEWIDE_BATCH_2_SOURCES,
  StatewidePortalProvider,
  parseStatewidePortalDetailHtml,
  parseStatewidePortalListingHtml,
  statewidePortalProvider,
} from "../statewidePortalsBatch2";

const listing = `
<table>
<tr><th>Agency</th><th>Bid Number</th><th>Description</th><th>Status</th><th>Advertised Date</th><th>Submission Date</th></tr>
<tr class="bid-result"><td>MS DEPT OF HEALTH</td><td>1301-26-R-IFBD-00074</td><td><a href="/dfa/contract_bid_search/Bid/Details/81234">BID: Laboratory Testing Services</a></td><td>Open</td><td>07/01/2099</td><td>07/31/2099</td></tr>
<tr class="bid-result"><td>Closed Agency</td><td>OLD-1234</td><td><a href="/dfa/contract_bid_search/Bid/Details/1">BID: Old Work</a></td><td>Closed</td><td>01/01/2020</td><td>01/02/2020</td></tr>
</table>`;

const detail = `
<table>
<tr><th>Title</th><td>Laboratory Testing Services</td></tr>
<tr><th>Agency</th><td>MS DEPT OF HEALTH</td></tr>
<tr><th>Description</th><td>Provide occupational laboratory testing and medical screening services statewide.</td></tr>
<tr><th>Buyer</th><td>Alex Buyer</td></tr>
<tr><th>Email</th><td>alex.buyer@ms.gov</td></tr>
<tr><th>Phone</th><td>601-555-1212</td></tr>
<tr><th>Submission Date</th><td>07/31/2099</td></tr>
</table>
<a href="/files/specifications.pdf">Specifications</a>
<a href="/files/addendum-1.pdf">Addendum 1</a>
<a href="/files/addendum-1.pdf">Duplicate addendum</a>
<a href="https://example.com/external.pdf">External</a>`;

describe("statewide batch manifest", () => {
  it("contains the exact six portal IDs", () => {
    assert.deepEqual(STATEWIDE_BATCH_2_SOURCES.map((s) => s.portalId), [
      "fl-vbs", "ga-gpr", "la-lapac", "me-rfps", "ms-magic", "nm-active-procurements",
    ]);
  });
  it("creates a concrete provider for every source", () => {
    for (const source of STATEWIDE_BATCH_2_SOURCES) assert.ok(statewidePortalProvider(source.portalId));
  });
});

describe("shared listing and detail parsing", () => {
  it("parses active rows and excludes closed rows", () => {
    const rows = parseStatewidePortalListingHtml("ms-magic", listing, "https://www.ms.gov/dfa/contract_bid_search/Search");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "81234");
    assert.equal(rows[0]!.solicitationNumber, "1301-26-R-IFBD-00074");
    assert.equal(rows[0]!.agency, "MS DEPT OF HEALTH");
  });
  it("extracts contact and same-origin documents", () => {
    const parsed = parseStatewidePortalDetailHtml("ms-magic", detail, "https://www.ms.gov/dfa/contract_bid_search/Bid/Details/81234");
    assert.equal(parsed.contactName, "Alex Buyer");
    assert.equal(parsed.contactEmail, "alex.buyer@ms.gov");
    assert.deepEqual(parsed.documentUrls, [
      "https://www.ms.gov/files/specifications.pdf",
      "https://www.ms.gov/files/addendum-1.pdf",
    ]);
  });
  it("parses embedded JSON used by dynamic portals", () => {
    const html = `<script>window.__DATA__={"id":"FL-9911","title":"RFP Medical Screening Services","status":"Open","detailUrl":"/search/bids/FL-9911","closingDate":"12/31/2099","agency":"Department of Health"}</script>`;
    const rows = parseStatewidePortalListingHtml("fl-vbs", html);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "FL-9911");
  });
  it("keeps unknown dates unknown", () => {
    const html = `<div class="opportunity-card"><a href="/bid/details/ABC-1234">RFP Medical Services ABC-1234</a><div>Status: Open</div></div>`;
    const rows = parseStatewidePortalListingHtml("ga-gpr", html);
    assert.equal(rows[0]!.postedDate, undefined);
    assert.equal(rows[0]!.responseDeadline, undefined);
  });
});

describe("provider behavior", () => {
  it("uses stable source-scoped IDs and enriches details", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/Search")) return new Response(listing, { status: 200 });
      if (url.includes("/Bid/Details/81234")) return new Response(detail, { status: 200 });
      return new Response("not found", { status: 404 });
    };
    try {
      const source = STATEWIDE_BATCH_2_SOURCES.find((s) => s.portalId === "ms-magic")!;
      const result = await new StatewidePortalProvider(source).fetch({ limit: 10 });
      assert.equal(result.records.length, 1);
      assert.equal(result.records[0]!.externalId, "ms-magic-81234");
      assert.equal(result.records[0]!.rawData?.providerPlatform, "mississippi_procurement_search");
    } finally { globalThis.fetch = original; }
  });

  it("applies keyword filtering", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => String(input).endsWith("/Search")
      ? new Response(listing, { status: 200 })
      : new Response(detail, { status: 200 });
    try {
      const source = STATEWIDE_BATCH_2_SOURCES.find((s) => s.portalId === "ms-magic")!;
      const provider = new StatewidePortalProvider(source);
      assert.equal((await provider.fetch({ keywords: "laboratory", limit: 10 })).records.length, 1);
      assert.equal((await provider.fetch({ keywords: "snowplow", limit: 10 })).records.length, 0);
    } finally { globalThis.fetch = original; }
  });

  it("implements nonzero offsets correctly", async () => {
    const rows = Array.from({ length: 5 }, (_, index) => `<tr class="bid-result"><td>Agency ${index}</td><td>RFP-2099-${index}</td><td><a href="/dfa/contract_bid_search/Bid/Details/${100 + index}">BID: Medical Service ${index}</a></td><td>Open</td><td>07/01/2099</td><td>07/31/2099</td></tr>`).join("");
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => String(input).endsWith("/Search")
      ? new Response(`<table><tr><th>Agency</th><th>Bid Number</th><th>Description</th><th>Status</th><th>Advertised Date</th><th>Submission Date</th></tr>${rows}</table>`, { status: 200 })
      : new Response(`<table><tr><th>Description</th><td>Medical service details</td></tr></table>`, { status: 200 });
    try {
      const source = STATEWIDE_BATCH_2_SOURCES.find((s) => s.portalId === "ms-magic")!;
      const result = await new StatewidePortalProvider(source).fetch({ limit: 2, offset: 2 });
      assert.equal(result.records.length, 2);
      assert.equal(result.records[0]!.externalId, "ms-magic-102");
    } finally { globalThis.fetch = original; }
  });

  it("returns listing records after detail failure", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
      if (String(input).endsWith("/Search")) return new Response(listing, { status: 200 });
      throw new Error("simulated detail failure");
    };
    try {
      const source = STATEWIDE_BATCH_2_SOURCES.find((s) => s.portalId === "ms-magic")!;
      const result = await new StatewidePortalProvider(source).fetch({ limit: 10 });
      assert.equal(result.records.length, 1);
      assert.ok(result.errors.some((error) => /detail enrichment failed/i.test(error)));
    } finally { globalThis.fetch = original; }
  });

  it("rejects login walls instead of returning fake rows", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response("<html><body>Login required</body></html>", { status: 200 });
    try {
      const source = STATEWIDE_BATCH_2_SOURCES.find((s) => s.portalId === "me-rfps")!;
      const result = await new StatewidePortalProvider(source).fetch({ limit: 10 });
      assert.equal(result.records.length, 0);
      assert.ok(result.errors.some((error) => /login\/browser wall/i.test(error)));
    } finally { globalThis.fetch = original; }
  });
});
