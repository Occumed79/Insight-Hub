import assert from "node:assert/strict";
import { it } from "node:test";
import {
  STATE_PLATFORM_ADAPTER_SOURCES,
  statePlatformAdapterProviders,
} from "../statePlatformAdapters";
import {
  extractPeopleSoftSubmitActions,
  parsePeopleSoftHiddenFields,
} from "../peopleSoftPublic";
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
