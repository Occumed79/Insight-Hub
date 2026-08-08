import assert from "node:assert/strict";
import { it } from "node:test";
import {
  STATE_PLATFORM_ADAPTER_SOURCES,
  statePlatformAdapterProviders,
} from "../statePlatformAdapters";
import {
  extractPeopleSoftSubmitActions,
  parsePeopleSoftHiddenFields,
  parsePeopleSoftVisibleRows,
  PeopleSoftPublicProvider,
} from "../peopleSoftPublic";
import { STATEWIDE_PORTAL_CONFIGS } from "../statewideProcurementConfigs";
import { parsePeriscopeCsvExportForm } from "../periscopePublic";
import { extractWebProcureEndpointCandidates } from "../webProcureIvaluaPublic";

it("registers the four shared platform families and preserves their required stateful actions", async () => {
  const expectedIds = [
    "ak-iris-vss",
    "az-app",
    "co-vss",
    "il-bidbuy",
    "ks-esupplier",
    "mn-swift",
    "nc-evp",
    "ok-omes",
    "or-oregonbuys",
    "pa-emarketplace",
    "ri-bids",
    "tn-edison",
    "wi-vendornet",
    "wv-oasis",
  ];
  assert.deepEqual(
    STATE_PLATFORM_ADAPTER_SOURCES.map((source) => source.id).sort(),
    expectedIds,
  );
  for (const sourceId of expectedIds) {
    const provider = statePlatformAdapterProviders[sourceId];
    assert.ok(provider, `missing platform adapter ${sourceId}`);
    assert.equal(await provider.isConfigured(), true, sourceId);
  }

  const peopleSoft = `
    <form id="win0" action="/psc/demo/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL">
      <input type="hidden" name="ICSID" value="abc123">
      <input type="hidden" name="ICStateNum" value="7">
      <input type="hidden" name="ICElementNum" value="0">
      <a onclick="submitAction_win0(document.win0,'SCP_PUB_BID_SEARCH')">Search</a>
      <a onclick="submitAction_win0(document.win0,'SCP_PUB_BID_LIST$hdown$0')">Next</a>
    </form>`;
  assert.equal(parsePeopleSoftHiddenFields(peopleSoft).get("ICSID"), "abc123");
  assert.deepEqual(extractPeopleSoftSubmitActions(peopleSoft), [
    "SCP_PUB_BID_SEARCH",
    "SCP_PUB_BID_LIST$hdown$0",
  ]);

  const periscope = `
    <form id="bidSearchResultsForm" method="post" action="/bso/view/search/external/advancedSearchBid.xhtml">
      <input type="hidden" name="_csrf" value="token">
      <input type="hidden" name="javax.faces.ViewState" value="state">
      <a title="Export to CSV File" onclick="mojarra.jsfcljs(document.getElementById('bidSearchResultsForm'),{'bidSearchResultsForm:bidResultId:csv':'bidSearchResultsForm:bidResultId:csv'},'');return false">CSV</a>
    </form>`;
  const exportForm = parsePeriscopeCsvExportForm(
    periscope,
    "https://oregonbuys.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
  );
  assert.ok(exportForm);
  assert.equal(exportForm.fields.get("_csrf"), "token");
  assert.equal(exportForm.exportName, "bidSearchResultsForm:bidResultId:csv");

  const endpoints = extractWebProcureEndpointCandidates(
    `const searchUrl = "/wp-web-public/api/bidboard/search";`,
    "https://webprocure.proactiscloud.com/wp-web-public/main.js",
    ["https://webprocure.proactiscloud.com"],
    { customerId: "46", organizationId: "120002" },
  );
  assert.equal(endpoints.length, 1);
  assert.match(endpoints[0]!, /customerid=46/);
  assert.match(endpoints[0]!, /oid=120002/);
});

const COOKIE_CHECK = `<html><body>You must have cookies enabled in order to sign in to your PeopleSoft application.</body></html>`;
const KANSAS_GRID = `
  <table>
    <tr><th>Event Name</th><th>Business Unit</th><th>Event ID</th><th>Ends In</th><th>Start Date</th><th>End Date</th><th>Details</th></tr>
    <tr><td>Occupational Health Examination Services</td><td>Department of Administration</td><td>EVT0099999</td><td>120 days</td><td>08/01/2099</td><td>12/31/2099</td><td><a href="javascript:submitAction_win0(document.win0,'SCP_PUB_BID_DTL$0')">Details</a></td></tr>
  </table>`;

function cookieHeader(init?: RequestInit): string {
  return new Headers(init?.headers).get("cookie") ?? "";
}

it("parses a PeopleSoft visible grid even when Details is JavaScript-only", () => {
  const kansas = STATEWIDE_PORTAL_CONFIGS.find(
    (config) => config.portalId === "ks-esupplier",
  );
  assert.ok(kansas);
  const rows = parsePeopleSoftVisibleRows(
    KANSAS_GRID,
    kansas,
    kansas.listingUrl,
    1,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.nativeId, "EVT0099999");
  assert.equal(rows[0]?.title, "Occupational Health Examination Services");
  assert.equal(rows[0]?.agency, "Department of Administration");
  assert.equal(rows[0]?.detailUrl, kansas.listingUrl);
});

it("uses a stable fallback identity when a PeopleSoft grid exposes N/A as the event ID", () => {
  const kansas = STATEWIDE_PORTAL_CONFIGS.find(
    (config) => config.portalId === "ks-esupplier",
  );
  assert.ok(kansas);
  const html = KANSAS_GRID.replace("EVT0099999", "N/A");
  const first = parsePeopleSoftVisibleRows(html, kansas, kansas.listingUrl, 1);
  const second = parsePeopleSoftVisibleRows(html, kansas, kansas.listingUrl, 1);
  assert.equal(first.length, 1);
  assert.equal(first[0]?.nativeId, second[0]?.nativeId);
  assert.notEqual(first[0]?.nativeId, "N/A");
});

it("replays a PeopleSoft public URL in the same session after cookie-check establishes a routing cookie", async () => {
  const originalFetch = globalThis.fetch;
  const listingUrl = "https://supplier.example.test/psc/demo/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL";
  let listingCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url !== listingUrl) throw new Error(`unexpected URL ${url}`);
    listingCalls += 1;
    if (listingCalls === 1) {
      return new Response(COOKIE_CHECK, {
        status: 200,
        headers: { "set-cookie": "PS_ROUTING=ready; Path=/; HttpOnly" },
      });
    }
    assert.match(cookieHeader(init), /PS_ROUTING=ready/);
    return new Response(KANSAS_GRID, { status: 200 });
  };

  try {
    const provider = new PeopleSoftPublicProvider({
      portalId: "ks-esupplier",
      buyerName: "State of Kansas",
      state: "KS",
      listingUrl,
      sourceBadge: "Kansas eSupplier Bid Opportunities",
    });
    const result = await provider.fetch({ limit: 2 });
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0]?.solicitationNumber, "EVT0099999");
    assert.equal(listingCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it("uses an explicit public landing bootstrap when the PeopleSoft cookie-check persists", async () => {
  const originalFetch = globalThis.fetch;
  const listingUrl = "https://supplier.example.test/psc/demo/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL";
  const bootstrapUrl = "https://supplier.example.test/psc/demo/SUPPLIER/ERP/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL";
  let listingCalls = 0;
  let bootstrapCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === bootstrapUrl) {
      bootstrapCalls += 1;
      return new Response("<html><body>Public supplier landing</body></html>", {
        status: 200,
        headers: { "set-cookie": "PS_PUBLIC=ready; Path=/; HttpOnly" },
      });
    }
    if (url !== listingUrl) throw new Error(`unexpected URL ${url}`);
    listingCalls += 1;
    if (!/PS_PUBLIC=ready/.test(cookieHeader(init))) {
      return new Response(COOKIE_CHECK, { status: 200 });
    }
    return new Response(KANSAS_GRID, { status: 200 });
  };

  try {
    const provider = new PeopleSoftPublicProvider({
      portalId: "ks-esupplier",
      buyerName: "State of Kansas",
      state: "KS",
      listingUrl,
      bootstrapUrls: [bootstrapUrl],
      sourceBadge: "Kansas eSupplier Bid Opportunities",
    });
    const result = await provider.fetch({ limit: 2 });
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0]?.title, "Occupational Health Examination Services");
    assert.equal(listingCalls, 3);
    assert.equal(bootstrapCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
