import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STATEWIDE_PORTAL_CONFIGS,
  STATEWIDE_PROCUREMENT_PORTAL_IDS,
  STATEWIDE_PROCUREMENT_SOURCES,
  StatewideProcurementProvider,
  parseStatewideDetailHtml,
  parseStatewideListingContent,
  statewideProcurementProviders,
} from "../statewideProcurementPortals";

const PA = STATEWIDE_PORTAL_CONFIGS.find((config) => config.portalId === "pa-emarketplace")!;
const FL = STATEWIDE_PORTAL_CONFIGS.find((config) => config.portalId === "fl-vbs")!;
const NC = STATEWIDE_PORTAL_CONFIGS.find((config) => config.portalId === "nc-evp")!;

const TABLE_FIXTURE = `
<table>
  <tr><th>Solicitation/Project#</th><th>Solicitation/Project Title</th><th>Department/Agency</th><th>Advertisement Type</th><th>Solicitation Start Date</th><th>Solicitation Due Date</th><th>Status</th></tr>
  <tr>
    <td>PA-26-1001</td>
    <td><a href="/SolicitationDetails.aspx?SID=PA-26-1001">Occupational health examination services</a></td>
    <td>Department of General Services</td><td>Service</td><td>07/01/2099</td><td>12/31/2099</td><td>Open</td>
  </tr>
  <tr>
    <td>PA-20-0001</td>
    <td><a href="/SolicitationDetails.aspx?SID=PA-20-0001">Expired services</a></td>
    <td>Department of General Services</td><td>Service</td><td>01/01/2020</td><td>02/01/2020</td><td>Closed</td>
  </tr>
  <tr>
    <td>PA-26-1001</td>
    <td><a href="/SolicitationDetails.aspx?SID=PA-26-1001">Occupational health examination services</a></td>
    <td>Department of General Services</td><td>Service</td><td>07/01/2099</td><td>12/31/2099</td><td>Open</td>
  </tr>
</table>`;

const DETAIL_FIXTURE = `
<html><body>
<h1>Respirator medical evaluations and physical examinations</h1>
<div>Solicitation Number: NC-26-4001</div>
<div>Department/Agency: Department of Adult Correction</div>
<div>Status: Open</div>
<div>Posted Date: 07/01/2099</div>
<div>Due Date: 12/31/2099</div>
<div>Description: Statewide occupational health services.</div>
<div>Buyer: Jane Buyer</div>
<div>Email: jane.buyer@nc.gov</div>
<div>Phone: 919-555-1212</div>
<div>Primary Commodity Code: 85120000</div>
<a href="/files/specifications.pdf">Specifications</a>
<a href="/files/addendum-1.pdf">Addendum 1</a>
<a href="/files/addendum-1.pdf">Addendum 1 duplicate</a>
<a href="https://example.com/external.pdf">External</a>
</body></html>`;

describe("statewide procurement source manifest", () => {
  it("registers the exact 12-state batch with no placeholders", () => {
    assert.equal(STATEWIDE_PORTAL_CONFIGS.length, 12);
    assert.equal(STATEWIDE_PROCUREMENT_SOURCES.length, 12);
    assert.deepEqual(
      Array.from(STATEWIDE_PROCUREMENT_PORTAL_IDS).sort(),
      [
        "fl-vbs", "ga-gpr", "la-lapac", "md-emma", "me-rfps", "mi-sigma",
        "ms-magic", "nc-evp", "nm-active-procurements", "oh-ohiobuys",
        "pa-emarketplace", "va-eva",
      ].sort(),
    );
    for (const config of STATEWIDE_PORTAL_CONFIGS) {
      assert.ok(config.listingUrl.startsWith(config.origin));
      assert.ok(config.buyerName);
      assert.ok(statewideProcurementProviders[config.portalId]);
    }
  });
});

describe("statewide listing parsers", () => {
  it("parses active table rows, excludes closed rows, and deduplicates", () => {
    const rows = parseStatewideListingContent(TABLE_FIXTURE, PA);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "PA-26-1001");
    assert.equal(rows[0]!.agency, "Department of General Services");
    assert.equal(rows[0]!.solicitationNumber, "PA-26-1001");
    assert.equal(rows[0]!.responseDeadline?.getUTCFullYear(), 2099);
  });

  it("parses public JSON payloads and keeps unknown dates unknown", () => {
    const payload = JSON.stringify({
      results: [{ id: "FL-26001", title: "Employee medical surveillance services", agency: "Department of Health", status: "Open", detailUrl: "/search/bids/FL-26001" }],
    });
    const rows = parseStatewideListingContent(payload, FL);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "FL-26001");
    assert.equal(rows[0]!.postedDate, undefined);
    assert.equal(rows[0]!.responseDeadline, undefined);
  });

  it("uses tenant-scoped deterministic IDs when a portal exposes only a detail URL", () => {
    const html = `<a href="/solicitations/details/?id=1c84090d-ba7a-ef11-a670-001dd809bcaf">Medical testing services</a>`;
    const rows = parseStatewideListingContent(html, NC);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "1c84090d-ba7a-ef11-a670-001dd809bcaf");
  });

  it("keeps a date-only deadline active through the due date", () => {
    const now = new Date();
    const dueDate = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
    const html = `<table><tr><th>Solicitation Number</th><th>Title</th><th>Due Date</th><th>Status</th></tr><tr><td>PA-TODAY-1</td><td><a href="/SolicitationDetails.aspx?SID=PA-TODAY-1">Same-day medical services</a></td><td>${dueDate}</td><td>Open</td></tr></table>`;
    const rows = parseStatewideListingContent(html, PA);
    assert.equal(rows.length, 1);
    assert.ok((rows[0]!.responseDeadline?.getTime() ?? 0) >= Date.now());
  });

  it("uses action-only detail links while taking the title from its table cell", () => {
    const html = `<table><tr><th>Solicitation Number</th><th>Title</th><th>Status</th><th>Action</th></tr><tr><td>PA-ACTION-1</td><td>Occupational medicine services</td><td>Open</td><td><a href="/SolicitationDetails.aspx?SID=PA-ACTION-1">Details</a></td></tr></table>`;
    const rows = parseStatewideListingContent(html, PA);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.title, "Occupational medicine services");
    assert.equal(rows[0]!.nativeId, "PA-ACTION-1");
  });
});

describe("statewide detail parser", () => {
  it("extracts agency, dates, contacts, commodity codes, and public documents", () => {
    const detail = parseStatewideDetailHtml(DETAIL_FIXTURE, NC, "https://evp.nc.gov/solicitations/details/?id=1c84090d-ba7a-ef11-a670-001dd809bcaf");
    assert.equal(detail.agency, "Department of Adult Correction");
    assert.equal(detail.solicitationNumber, "NC-26-4001");
    assert.equal(detail.contactEmail, "jane.buyer@nc.gov");
    assert.equal(detail.contactPhone, "919-555-1212");
    assert.equal(detail.commodity, "85120000");
    assert.deepEqual(detail.documentUrls.sort(), ["https://evp.nc.gov/files/addendum-1.pdf", "https://evp.nc.gov/files/specifications.pdf"]);
  });
});

describe("statewide provider behavior", () => {
  it("collects enough rows before applying a nonzero offset", async () => {
    const originalFetch = globalThis.fetch;
    const rows = [1, 2, 3].map((number) => `<tr><td>PA-26-100${number}</td><td><a href="/SolicitationDetails.aspx?SID=PA-26-100${number}">Medical service ${number}</a></td><td>Department ${number}</td><td>Service</td><td>07/01/2099</td><td>12/31/2099</td><td>Open</td></tr>`).join("");
    const listing = `<table><tr><th>Solicitation Number</th><th>Title</th><th>Agency</th><th>Type</th><th>Posted Date</th><th>Due Date</th><th>Status</th></tr>${rows}</table>`;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === PA.listingUrl) return new Response(listing, { status: 200 });
      if (url.includes("SolicitationDetails.aspx")) return new Response("<h1>Medical service</h1><div>Status: Open</div><div>Due Date: 12/31/2099</div>", { status: 200 });
      return new Response("not found", { status: 404 });
    };
    try {
      const result = await new StatewideProcurementProvider(PA).fetch({ limit: 1, offset: 1 });
      assert.equal(result.records.length, 1);
      assert.equal(result.records[0]!.externalId, "pa-emarketplace-PA-26-1002");
      assert.equal(result.records[0]!.rawData?.sourceId, "pa-emarketplace");
      assert.equal(result.records[0]!.rawData?.dateUnknown, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
