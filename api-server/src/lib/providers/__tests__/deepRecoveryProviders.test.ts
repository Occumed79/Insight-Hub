import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { georgiaGaworkProvider } from "../georgiaGawork";
import {
  hawaiiHandsProvider,
  parseHawaiiHandsJson,
} from "../hawaiiHands";
import { describeOfficialPortalRequestError } from "../officialPortalHttp";
import {
  minnesotaOspProvider,
  parseMinnesotaOspHtml,
} from "../minnesotaOsp";
import {
  oregonBuysProvider,
  parseOregonBuysListingHtml,
} from "../oregonBuys";
import { STATEWIDE_LIVE_TARGETS } from "../runStatewideLiveVerification";
import {
  parseSouthDakotaPostingBoardJson,
  southDakotaPostingBoardProvider,
} from "../southDakotaPostingBoard";

describe("blocked-state deep recovery providers", () => {
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
    assert.equal(rows[0]!.title, "DNR RFB Kawishiwi Falls Parking Lot");
    assert.deepEqual(rows[0]!.categoryCodes, ["72103301", "72141003"]);
    assert.equal(rows[0]!.responseDeadline?.getFullYear(), 2099);
  });

  it("parses Hawaii's first-party HANDS search response", () => {
    const rows = parseHawaiiHandsJson(JSON.stringify({
      data: {
        searchResult: {
          content: [{
            id: 91827,
            solicitionNo: "RFP-26-001",
            title: "Statewide Occupational Health Services",
            category: "Health and Human Services",
            jurisdiction: "Executive Branch",
            department: "Department of Human Services",
            island: "Statewide",
            publishDate: "07/15/2026",
            dueDate: "08/31/2099 2:00 PM",
            status: "POSTED",
            system: "HANDS",
          }],
        },
      },
    }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, 91827);
    assert.equal(rows[0]!.solicitionNo, "RFP-26-001");
    assert.equal(rows[0]!.title, "Statewide Occupational Health Services");
  });

  it("parses OregonBuys BSO open-bid rows and preserves official detail URLs", () => {
    const html = `<table>
      <tr><th>Bid Number</th><th>Organization</th><th>Buyer</th><th>Description</th><th>Bid Opening Date</th><th>Status</th></tr>
      <tr>
        <td><a href="/bso/external/bidDetail.sda?docId=S-73000-00017535&amp;external=true&amp;parentUrl=close">S-73000-00017535</a></td>
        <td>Department of Transportation</td>
        <td>Terri Buyer</td>
        <td>Grinding and Paving Services</td>
        <td>12/31/2099 2:00 PM</td>
        <td>Sent</td>
      </tr>
    </table>`;

    const rows = parseOregonBuysListingHtml(html);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.bidNumber, "S-73000-00017535");
    assert.equal(rows[0]!.organization, "Department of Transportation");
    assert.equal(rows[0]!.buyer, "Terri Buyer");
    assert.equal(rows[0]!.description, "Grinding and Paving Services");
    assert.equal(
      rows[0]!.detailUrl,
      "https://oregonbuys.gov/bso/external/bidDetail.sda?docId=S-73000-00017535&external=true&parentUrl=close",
    );
  });

  it("parses South Dakota's first-party posting-board API payload", () => {
    const events = parseSouthDakotaPostingBoardJson(JSON.stringify({
      data: [{
        eventId: 19839,
        eventName: "Statewide Medical Services RFP",
        publishedDate: "2026-07-15T12:00:00Z",
        eventDueDate: "2099-08-01T20:00:00Z",
        invitationType: { description: "Request for Proposal" },
        status: { description: "Open" },
      }],
      totalCount: 1,
    }));
    assert.equal(events.length, 1);
    assert.equal(events[0]!.eventId, 19839);
    assert.equal(events[0]!.eventName, "Statewide Medical Services RFP");
  });

  it("uses the dedicated recovery providers in the 50-state verifier", () => {
    const georgia = STATEWIDE_LIVE_TARGETS.find((target) => target.state === "GA");
    const hawaii = STATEWIDE_LIVE_TARGETS.find((target) => target.state === "HI");
    const minnesota = STATEWIDE_LIVE_TARGETS.find((target) => target.state === "MN");
    const oregon = STATEWIDE_LIVE_TARGETS.find((target) => target.state === "OR");
    const southDakota = STATEWIDE_LIVE_TARGETS.find((target) => target.state === "SD");
    assert.equal(georgia?.provider, georgiaGaworkProvider);
    assert.equal(hawaii?.provider, hawaiiHandsProvider);
    assert.equal(minnesota?.provider, minnesotaOspProvider);
    assert.equal(oregon?.provider, oregonBuysProvider);
    assert.equal(southDakota?.provider, southDakotaPostingBoardProvider);
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
