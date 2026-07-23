import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractCgiAdvantageInitialState,
  kentuckyCgiAdvantageProvider,
  michiganCgiAdvantageProvider,
  parseCgiAdvantageSolicitationRows,
} from "../cgiAdvantagePublic";
import { georgiaGaworkProvider } from "../georgiaGawork";
import {
  hawaiiHandsProvider,
  parseHawaiiHandsJson,
} from "../hawaiiHands";
import {
  minnesotaOspProvider,
  parseMinnesotaOspHtml,
} from "../minnesotaOsp";
import { newHampshireBidsProvider } from "../newHampshireBids";
import { describeOfficialPortalRequestError } from "../officialPortalHttp";
import { parseOregonBuysListingHtml } from "../oregonBuys";
import { STATEWIDE_LIVE_TARGETS } from "../runStatewideLiveVerification";
import {
  parseSouthDakotaPostingBoardJson,
  southDakotaPostingBoardProvider,
} from "../southDakotaPostingBoard";
import { statePlatformAdapterProviders } from "../statePlatformAdapters";

describe("blocked-state deep recovery providers", () => {
  it("extracts the CGI Advantage public initial state", () => {
    const state = extractCgiAdvantageInitialState(`
      <script>
        window.moInitialResponse = {
          "session_info":{"session_id":"guest","page_id":"123","csrf_token":"token"},
          "data":{"page_data":{}}
        };
      </script>
    `);
    assert.deepEqual(state.session_info, {
      session_id: "guest",
      page_id: "123",
      csrf_token: "token",
    });
  });

  it("parses CGI Advantage published-solicitation rows", () => {
    const rows = parseCgiAdvantageSolicitationRows({
      data: {
        ds_data: {
          T1SO_SRCH_QRY: {
            row_data: [{
              ADV_ROW_ID: "row-1",
              DOC_CD: "RFP",
              DOC_DSCR: "Statewide Occupational Health Services",
              DEPT_NM: "Department of Administration",
              BUYR_NM: "Alex Buyer",
              BUYR_EMAIL_AD: "buyer@example.gov",
              DOC_REF: "[RFP,758,2600000675,4][RFP-758-2600000675-4]",
              DOC_CD_CONCAT: "Request for Proposals (RFP)",
              SO_CLSNG_DT_TM: 4099680000000,
              PUB_DT: 1784088000000,
              SO_STA: "O",
            }],
          },
        },
      },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.DOC_DSCR, "Statewide Occupational Health Services");
    assert.equal(rows[0]!.DOC_REF, "[RFP,758,2600000675,4][RFP-758-2600000675-4]");
  });

  it("parses Minnesota's official labeled solicitation bulletin", () => {
    const html = `<main>
      <div>REFERENCE NUMBER: 37413</div>
      <div>Purchasing Agency: Natural Resources Department</div>
      <div>Solicitation Number: 2000018497</div>
      <div>Title: DNR RFB Kawishiwi Falls Parking Lot</div>
      <div>Response to this solicitation is due no later than: 07/28/2099 at 2:00pm</div>
      <div>Description of Work: Bituminous parking lot improvements.</div>
      <div>Date This Solicitation Was Posted: 07/17/2099 at 4:10pm</div>
      <div>Category Codes: 72103301, 72141003</div>
    </main>`;
    const rows = parseMinnesotaOspHtml(html);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.referenceNumber, "37413");
    assert.equal(rows[0]!.solicitationNumber, "2000018497");
    assert.equal(rows[0]!.agency, "Natural Resources Department");
    assert.deepEqual(rows[0]!.categoryCodes, ["72103301", "72141003"]);
  });

  it("parses Hawaii's first-party HANDS search response", () => {
    const rows = parseHawaiiHandsJson(JSON.stringify({
      data: {
        searchResult: {
          content: [{
            id: 91827,
            solicitionNo: "RFP-26-001",
            title: "Statewide Occupational Health Services",
            status: "POSTED",
          }],
        },
      },
    }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, 91827);
    assert.equal(rows[0]!.solicitionNo, "RFP-26-001");
  });

  it("parses OregonBuys BSO open-bid rows", () => {
    const html = `<table><tr>
      <td><a href="/bso/external/bidDetail.sda?docId=S-73000-00017535&amp;external=true&amp;parentUrl=close">S-73000-00017535</a></td>
      <td>Department of Transportation</td>
      <td>Terri Buyer</td>
      <td>Grinding and Paving Services</td>
      <td>12/31/2099 2:00 PM</td>
      <td>Sent</td>
    </tr></table>`;
    const rows = parseOregonBuysListingHtml(html);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.bidNumber, "S-73000-00017535");
    assert.equal(rows[0]!.organization, "Department of Transportation");
  });

  it("parses South Dakota's first-party posting-board API payload", () => {
    const events = parseSouthDakotaPostingBoardJson(JSON.stringify({
      data: [{
        eventId: 19839,
        eventName: "Statewide Medical Services RFP",
        eventDueDate: "2099-08-01T20:00:00Z",
      }],
    }));
    assert.equal(events.length, 1);
    assert.equal(events[0]!.eventId, 19839);
  });

  it("uses every dedicated recovery provider in the 50-state verifier", () => {
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "GA")?.provider, georgiaGaworkProvider);
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "HI")?.provider, hawaiiHandsProvider);
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "KY")?.provider, kentuckyCgiAdvantageProvider);
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "MI")?.provider, michiganCgiAdvantageProvider);
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "MN")?.provider, minnesotaOspProvider);
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "NH")?.provider, newHampshireBidsProvider);
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "OR")?.provider, statePlatformAdapterProviders["or-oregonbuys"]);
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "SD")?.provider, southDakotaPostingBoardProvider);
  });

  it("reports the underlying network cause instead of generic fetch failed", () => {
    const error = new Error("fetch failed") as Error & { cause?: unknown };
    error.cause = {
      code: "ENOTFOUND",
      syscall: "getaddrinfo",
      hostname: "oregonbuys.gov",
    };
    assert.equal(
      describeOfficialPortalRequestError(error, "OregonBuys open bids", 30_000),
      "OregonBuys open bids network request failed (code=ENOTFOUND, syscall=getaddrinfo, hostname=oregonbuys.gov): fetch failed",
    );
  });
});
