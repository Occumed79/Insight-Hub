import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STATEWIDE_PORTAL_CONFIGS,
  STATEWIDE_PROCUREMENT_PORTAL_IDS,
  STATEWIDE_PROCUREMENT_SOURCES,
  StatewideProcurementProvider,
  allowedStatewideUrl,
  extractStatewideDiscoveryUrls,
  parseStatewideDetailHtml,
  parseStatewideListingContent,
  statewideProcurementProviders,
  statewideRetryDelayMs,
} from "../statewideProcurementPortals";

const config = (portalId: string) => {
  const found = STATEWIDE_PORTAL_CONFIGS.find((item) => item.portalId === portalId);
  assert.ok(found, `missing config ${portalId}`);
  return found;
};

const PA = config("pa-emarketplace");
const FL = config("fl-vbs");
const NC = config("nc-evp");
const AL = config("al-state-procurement");
const AR = config("ar-arbuy");
const KS = config("ks-esupplier");
const MT = config("mt-emacs");
const CT = config("ct-ctsource");
const UT = config("ut-purchasing");
const WY = config("wy-state-purchasing");
const WI = config("wi-vendornet");

const EXISTING_SHARED_IDS = [
  "fl-vbs", "ga-gpr", "la-lapac", "md-emma", "me-rfps", "mi-sigma",
  "ms-magic", "nc-evp", "nm-active-procurements", "oh-ohiobuys",
  "pa-emarketplace", "va-eva",
] as const;

const NEW_IDS = [
  "al-state-procurement", "ak-iris-vss", "az-app", "ar-arbuy", "co-vss",
  "ct-ctsource", "de-mymarketplace", "hi-hiepro", "id-purchasing", "il-bidbuy",
  "in-idoa", "ks-esupplier", "ky-vss", "mn-swift", "mo-missouribuys", "mt-emacs",
  "ne-state-purchasing", "nh-bids", "nd-spo", "ok-omes", "or-oregonbuys",
  "ri-bids", "sc-sceis", "sd-solicitations", "tn-edison", "ut-purchasing",
  "vt-bids", "wa-webs", "wv-oasis", "wi-vendornet", "wy-state-purchasing",
] as const;

const DIRECT_STATE_ADAPTERS_OUTSIDE_SHARED_FAMILY = ["CA", "IA", "MA", "NJ", "NV", "NY", "TX"] as const;
const ALL_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY",
] as const;

const TABLE_FIXTURE = `
<table>
  <tr><th>Solicitation/Project#</th><th>Solicitation/Project Title</th><th>Department/Agency</th><th>Advertisement Type</th><th>Solicitation Start Date</th><th>Solicitation Due Date</th><th>Status</th></tr>
  <tr><td>PA-26-1001</td><td><a href="/SolicitationDetails.aspx?SID=PA-26-1001">Occupational health examination services</a></td><td>Department of General Services</td><td>Service</td><td>07/01/2099</td><td>12/31/2099</td><td>Open</td></tr>
  <tr><td>PA-20-0001</td><td><a href="/SolicitationDetails.aspx?SID=PA-20-0001">Expired services</a></td><td>Department of General Services</td><td>Service</td><td>01/01/2020</td><td>02/01/2020</td><td>Closed</td></tr>
  <tr><td>PA-26-1001</td><td><a href="/SolicitationDetails.aspx?SID=PA-26-1001">Occupational health examination services</a></td><td>Department of General Services</td><td>Service</td><td>07/01/2099</td><td>12/31/2099</td><td>Open</td></tr>
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
  it("registers all 31 new IDs while preserving the 12 shared-family IDs already merged", () => {
    assert.equal(STATEWIDE_PORTAL_CONFIGS.length, 43);
    assert.equal(STATEWIDE_PROCUREMENT_SOURCES.length, 43);
    assert.deepEqual(Array.from(STATEWIDE_PROCUREMENT_PORTAL_IDS).sort(), [...EXISTING_SHARED_IDS, ...NEW_IDS].sort());
    for (const id of [...EXISTING_SHARED_IDS, ...NEW_IDS]) assert.ok(statewideProcurementProviders[id]);
  });

  it("combines with the seven existing specialized statewide adapters to cover exactly 50 states", () => {
    const states = new Set([...STATEWIDE_PORTAL_CONFIGS.map((item) => item.state), ...DIRECT_STATE_ADAPTERS_OUTSIDE_SHARED_FAMILY]);
    assert.equal(states.size, 50);
    assert.deepEqual(Array.from(states).sort(), [...ALL_STATE_CODES].sort());
  });

  it("contains runnable official routes rather than placeholders or catalog-only records", async () => {
    for (const item of STATEWIDE_PORTAL_CONFIGS) {
      assert.ok(/^https:\/\//.test(item.listingUrl), item.portalId);
      assert.ok(item.buyerName && item.sourceBadge && item.platformFamily, item.portalId);
      assert.equal(allowedStatewideUrl(item, item.listingUrl), item.listingUrl);
      assert.equal(await statewideProcurementProviders[item.portalId]!.isConfigured(), true);
    }
  });
});

describe("statewide listing parser platform fixtures", () => {
  it("parses static state tables, excludes closed rows, and deduplicates", () => {
    const rows = parseStatewideListingContent(TABLE_FIXTURE, PA);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "PA-26-1001");
    assert.equal(rows[0]!.agency, "Department of General Services");
  });

  it("parses CGI Advantage-style tables", () => {
    const html = `<table><tr><th>Bid Number</th><th>Description</th><th>Department</th><th>Closing Date</th><th>Status</th><th>Action</th></tr><tr><td>AL-100</td><td>Medical surveillance services</td><td>Finance</td><td>12/31/2099</td><td>Open</td><td><a href="/PRDVSS1X1/AltSelfService?bidId=AL-100">View</a></td></tr></table>`;
    const rows = parseStatewideListingContent(html, AL);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "AL-100");
  });

  it("parses Periscope BSO action links and takes the title from its description cell", () => {
    const html = `<table><tr><th>Bid Number</th><th>Organization</th><th>Description</th><th>Bid Opening Date</th><th>Status</th><th>Action</th></tr><tr><td>AR-100</td><td>Department of Health</td><td>Occupational medicine services</td><td>12/31/2099 2:00 PM</td><td>Open</td><td><a href="/bso/external/bidDetail.sda?docId=AR-100">Details</a></td></tr></table>`;
    const rows = parseStatewideListingContent(html, AR);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.title, "Occupational medicine services");
    assert.equal(rows[0]!.nativeId, "AR-100");
  });

  it("parses PeopleSoft public bid list rows", () => {
    const html = `<table><tr><th>Event ID</th><th>Event Name</th><th>Event Status</th><th>Start Date</th><th>End Date</th></tr><tr><td><a href="/psc/sokfsprdsup/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?EventID=KS-100">KS-100</a></td><td>Employee physical examinations</td><td>Posted</td><td>01/01/2099</td><td>12/31/2099</td></tr></table>`;
    const rows = parseStatewideListingContent(html, KS);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.solicitationNumber, "KS-100");
  });

  it("parses Jaggaer/SciQuest public event rows", () => {
    const html = `<table><tr><th>Event Number</th><th>Event Title</th><th>Organization</th><th>Close Date</th><th>Status</th></tr><tr><td>MT-100</td><td><a href="/apps/Router/PublicEvent?CustomerOrg=StateOfMontana&eventId=MT-100">Clinical testing services</a></td><td>Department of Administration</td><td>12/31/2099</td><td>Open</td></tr></table>`;
    const rows = parseStatewideListingContent(html, MT);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "MT-100");
  });

  it("parses WebProcure/Ivalua JSON payloads and keeps unknown dates unknown", () => {
    const payload = JSON.stringify({ results: [{ solicitationId: "CT-100", solicitationTitle: "Medical testing", agency: "DAS", status: "Open", detailUrl: "https://webprocure.proactiscloud.com/wp-web-public/#/bidboard/bid/CT-100" }] });
    const rows = parseStatewideListingContent(payload, CT);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "CT-100");
    assert.equal(rows[0]!.postedDate, undefined);
  });

  it("parses Bonfire public opportunity API JSON", () => {
    const payload = JSON.stringify({ success: 1, payload: { projects: { one: { ProjectID: "UT-100", ReferenceID: "RFP-UT-100", ProjectName: "Drug testing services", DateOpen: "2099-01-01", DateClose: "2099-12-31", ProjectStatusID: "Open" } } } });
    const rows = parseStatewideListingContent(payload, UT, "https://utah.bonfirehub.com/PublicPortal/getOpenPublicOpportunitiesSectionData");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "UT-100");
    assert.equal(rows[0]!.detailUrl, "https://utah.bonfirehub.com/opportunities/UT-100");
  });

  it("parses Public Purchase listings", () => {
    const html = `<table><tr><th>Title</th><th>Start Date</th><th>End Date</th><th>Status</th></tr><tr><td><a href="/gems/wyominggsd,wy/bid/bidView?bidId=WY-100">Statewide laboratory services</a></td><td>01/01/2099</td><td>12/31/2099</td><td>Open</td></tr></table>`;
    const rows = parseStatewideListingContent(html, WY);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "WY-100");
  });

  it("parses custom VendorNet-style rows and direct solicitation documents", () => {
    const html = `<table><tr><th>Bid Number</th><th>Title</th><th>Due Date</th><th>Status</th><th>Documents</th></tr><tr><td>WI-100</td><td>Respirator medical evaluation services</td><td>12/31/2099</td><td>Open</td><td><a href="/Documents/WI-100.pdf">Bid package</a></td></tr></table>`;
    const rows = parseStatewideListingContent(html, WI);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "WI-100");
    assert.deepEqual(rows[0]!.documentUrls, ["https://vendornet.wi.gov/Documents/WI-100.pdf"]);
  });
});

describe("statewide discovery and normalization regressions", () => {
  it("discovers configured cross-origin official bid boards and embedded frames", () => {
    const html = `<iframe src="https://webprocure.proactiscloud.com/wp-web-public/#/bidboard"></iframe>`;
    assert.deepEqual(extractStatewideDiscoveryUrls(html, CT.listingUrl, CT), ["https://webprocure.proactiscloud.com/wp-web-public/#/bidboard"]);
  });

  it("rejects malformed and non-official URLs", () => {
    assert.equal(allowedStatewideUrl(CT, "https://evil.example/bids"), undefined);
    assert.equal(allowedStatewideUrl(CT, "http://%"), undefined);
    const html = `<a href="http://%">Broken</a><a href="https://evil.example/bid/1">Bid</a>`;
    assert.deepEqual(parseStatewideListingContent(html, CT), []);
  });

  it("keeps a date-only deadline active through the due date", () => {
    const now = new Date();
    const dueDate = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
    const html = `<table><tr><th>Solicitation Number</th><th>Title</th><th>Due Date</th><th>Status</th></tr><tr><td>PA-TODAY-1</td><td><a href="/SolicitationDetails.aspx?SID=PA-TODAY-1">Same-day medical services</a></td><td>${dueDate}</td><td>Open</td></tr></table>`;
    const rows = parseStatewideListingContent(html, PA);
    assert.equal(rows.length, 1);
    assert.ok((rows[0]!.responseDeadline?.getTime() ?? 0) >= Date.now());
  });

  it("uses tenant-scoped deterministic IDs when a portal exposes only a detail URL", () => {
    const html = `<a href="/solicitations/details/?id=1c84090d-ba7a-ef11-a670-001dd809bcaf">Medical testing services</a>`;
    const rows = parseStatewideListingContent(html, NC);
    assert.equal(rows[0]!.nativeId, "1c84090d-ba7a-ef11-a670-001dd809bcaf");
  });

  it("honors numeric and HTTP-date Retry-After headers", () => {
    assert.equal(statewideRetryDelayMs("2", 0), 2_000);
    assert.ok(statewideRetryDelayMs(new Date(Date.now() + 1_000).toUTCString(), 0) <= 1_100);
    assert.equal(statewideRetryDelayMs(null, 2), 1_600);
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

  it("returns listing records when one detail request fails", async () => {
    const originalFetch = globalThis.fetch;
    const originalRetries = process.env.STATEWIDE_PORTAL_MAX_RETRIES;
    process.env.STATEWIDE_PORTAL_MAX_RETRIES = "0";
    const listing = `<table><tr><th>Solicitation Number</th><th>Title</th><th>Due Date</th><th>Status</th></tr><tr><td>PA-1</td><td><a href="/SolicitationDetails.aspx?SID=PA-1">Medical one</a></td><td>12/31/2099</td><td>Open</td></tr><tr><td>PA-2</td><td><a href="/SolicitationDetails.aspx?SID=PA-2">Medical two</a></td><td>12/31/2099</td><td>Open</td></tr></table>`;
    globalThis.fetch = async (input) => String(input).includes("SID=PA-1")
      ? new Response("failed", { status: 500 })
      : String(input).includes("SID=PA-2")
        ? new Response("<h1>Medical two enriched</h1><div>Due Date: 12/31/2099</div>", { status: 200 })
        : new Response(listing, { status: 200 });
    try {
      const result = await new StatewideProcurementProvider(PA).fetch({ limit: 2 });
      assert.equal(result.records.length, 2);
      assert.ok(result.errors.some((error) => error.includes("detail enrichment failed")));
    } finally {
      globalThis.fetch = originalFetch;
      if (originalRetries === undefined) delete process.env.STATEWIDE_PORTAL_MAX_RETRIES;
      else process.env.STATEWIDE_PORTAL_MAX_RETRIES = originalRetries;
    }
  });

  it("bounds redirect loops instead of following them indefinitely", async () => {
    const originalFetch = globalThis.fetch;
    const originalRetries = process.env.STATEWIDE_PORTAL_MAX_RETRIES;
    process.env.STATEWIDE_PORTAL_MAX_RETRIES = "0";
    globalThis.fetch = async () => new Response("", { status: 302, headers: { location: PA.listingUrl } });
    try {
      const result = await new StatewideProcurementProvider(PA).fetch({ limit: 1 });
      assert.equal(result.records.length, 0);
      assert.ok(result.errors.some((error) => error.includes("redirect loop")));
    } finally {
      globalThis.fetch = originalFetch;
      if (originalRetries === undefined) delete process.env.STATEWIDE_PORTAL_MAX_RETRIES;
      else process.env.STATEWIDE_PORTAL_MAX_RETRIES = originalRetries;
    }
  });
});
