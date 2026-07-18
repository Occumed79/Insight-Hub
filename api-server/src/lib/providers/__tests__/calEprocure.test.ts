import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAL_EPROCURE_LISTING_URL,
  CAL_EPROCURE_SOURCE,
  CalEprocureProvider,
  parseCalEprocureDetailHtml,
  parseCalEprocureListingHtml,
} from "../calEprocure";

const LISTING_FIXTURE = `
<html><body>
<table>
<tr><th>Department</th><th>Department Name</th><th>Event ID</th><th>Event Name</th><th>Format</th><th>Type</th><th>End Date</th><th>Status</th><th>Buyer Name</th><th>Buyer Email</th></tr>
<tr class="ps_grid-row">
  <td>2720</td>
  <td>Dept of the CA Highway Patrol</td>
  <td><a href="/psc/psfpd1/SUPPLIER/ERP/c/AUC_MANAGE_BIDS.AUC_RESP_INQ_DTL.GBL?AUC_ID=0000099999&AUC_ROUND=1&AUC_VERSION=1&BUSINESS_UNIT=2720&PAGE=AUC_RESP_INQ_DTL">0000099999</a></td>
  <td>IFB 26C135001 - Occupational Health Examination Services</td>
  <td>Sell</td>
  <td>RFx</td>
  <td>12/31/2099 11:00AM PST</td>
  <td>Posted</td>
  <td>Janine Kimzey</td>
  <td>janine.kimzey@chp.ca.gov</td>
</tr>
<tr class="ps_grid-row">
  <td>7100</td>
  <td>Employment Development Department</td>
  <td>0000088888</td>
  <td>Closed Courier Services</td>
  <td>Sell</td>
  <td>RFx</td>
  <td>01/01/2020 10:00AM PST</td>
  <td>Closed</td>
  <td>Andrea Buyer</td>
  <td>andrea@example.ca.gov</td>
</tr>
<tr class="ps_grid-row">
  <td>2720</td>
  <td>Dept of the CA Highway Patrol</td>
  <td>0000099999</td>
  <td>IFB 26C135001 - Occupational Health Examination Services</td>
  <td>Sell</td>
  <td>RFx</td>
  <td>12/31/2099 11:00AM PST</td>
  <td>Posted</td>
  <td>Janine Kimzey</td>
  <td>janine.kimzey@chp.ca.gov</td>
</tr>
</table>
</body></html>`;

const DETAIL_FIXTURE = `
<html><body>
<h2>Dept of the CA Highway Patrol</h2>
<div>Event ID</div><div>0000099999</div>
<div>Event Format/Type</div><div>Sell Event RFx</div>
<div>Published Date</div><div>07/18/2099 9:11AM PDT</div>
<div>Event End Date:</div><div>12/31/2099 11:00AM PST</div>
<div>Event Description:</div>
<div>The California Highway Patrol invites bidders to provide occupational health examinations and respirator clearance services.</div>
<div>Payment Terms:</div><div>Net 45</div>
<div>Contact</div><div>Janine Kimzey</div>
<div>Phone</div><div>916/843-3510</div>
<div>Email:</div><div>janine.kimzey@chp.ca.gov</div>
<a href="/documents/specifications.pdf">View Event Package</a>
<a href="/documents/addendum-1.pdf">Addendum 1</a>
<a href="/documents/addendum-1.pdf">Addendum 1 duplicate</a>
<a href="https://example.com/external.pdf">External attachment</a>
</body></html>`;

describe("Cal eProcure source configuration", () => {
  it("registers a concrete enabled statewide source", () => {
    assert.equal(CAL_EPROCURE_SOURCE.id, "ca-caleprocure");
    assert.equal(CAL_EPROCURE_SOURCE.enabled, true);
    assert.equal(CAL_EPROCURE_SOURCE.scraperType, "existing_parser");
    assert.equal(new URL(CAL_EPROCURE_SOURCE.sourceUrl).hostname, "caleprocure.ca.gov");
  });
});

describe("Cal eProcure listing parser", () => {
  it("parses posted events, excludes closed events, and removes duplicates", () => {
    const records = parseCalEprocureListingHtml(LISTING_FIXTURE);
    assert.equal(records.length, 1);
    const record = records[0]!;
    assert.equal(record.businessUnit, "2720");
    assert.equal(record.departmentName, "Dept of the CA Highway Patrol");
    assert.equal(record.eventId, "0000099999");
    assert.equal(record.status, "Posted");
    assert.equal(record.buyerEmail, "janine.kimzey@chp.ca.gov");
    assert.match(record.detailUrl, /AUC_ID=0000099999/);
  });

  it("builds a stable PSRelay detail URL when the row has no direct detail anchor", () => {
    const html = LISTING_FIXTURE.replace(/<a href="[^"]+">0000099999<\/a>/, "0000099999");
    const records = parseCalEprocureListingHtml(html);
    assert.equal(records.length, 1);
    assert.match(records[0]!.detailUrl, /\/PSRelay\/AUC_MANAGE_BIDS\.AUC_RESP_INQ_AUC\.GBL/);
    assert.match(records[0]!.detailUrl, /BUSINESS_UNIT=2720/);
  });
});

describe("Cal eProcure detail parser", () => {
  it("extracts public event details and contact information", () => {
    const detail = parseCalEprocureDetailHtml(
      DETAIL_FIXTURE,
      "https://caleprocure.ca.gov/PSRelay/AUC_MANAGE_BIDS.AUC_RESP_INQ_AUC.GBL?BUSINESS_UNIT=2720&AUC_ID=0000099999",
    );
    assert.equal(detail.eventId, "0000099999");
    assert.equal(detail.agencyName, "Dept of the CA Highway Patrol");
    assert.match(detail.description ?? "", /occupational health examinations/i);
    assert.equal(detail.contactName, "Janine Kimzey");
    assert.equal(detail.contactPhone, "916/843-3510");
    assert.equal(detail.contactEmail, "janine.kimzey@chp.ca.gov");
    assert.equal(detail.publishedDate?.getUTCFullYear(), 2099);
  });

  it("deduplicates same-origin package and addendum URLs", () => {
    const detail = parseCalEprocureDetailHtml(
      DETAIL_FIXTURE,
      "https://caleprocure.ca.gov/PSRelay/AUC_MANAGE_BIDS.AUC_RESP_INQ_AUC.GBL?BUSINESS_UNIT=2720&AUC_ID=0000099999",
    );
    assert.deepEqual(detail.documentUrls.sort(), [
      "https://caleprocure.ca.gov/documents/addendum-1.pdf",
      "https://caleprocure.ca.gov/documents/specifications.pdf",
    ]);
  });
});

describe("Cal eProcure provider", () => {
  it("maintains the PeopleSoft cookie session and returns normalized records", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; cookie?: string }> = [];
    let listingAttempts = 0;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      requests.push({ url, cookie: headers.get("cookie") ?? undefined });
      if (url === CAL_EPROCURE_LISTING_URL) {
        listingAttempts += 1;
        if (listingAttempts === 1) {
          return new Response("", {
            status: 302,
            headers: {
              location: CAL_EPROCURE_LISTING_URL,
              "set-cookie": "PS_TOKEN=test-session; Path=/; Secure",
            },
          });
        }
        return new Response(LISTING_FIXTURE, { status: 200 });
      }
      if (/AUC_ID=0000099999/.test(url)) return new Response(DETAIL_FIXTURE, { status: 200 });
      return new Response("not found", { status: 404 });
    };

    try {
      const provider = new CalEprocureProvider();
      const result = await provider.fetch({ keywords: "occupational health", limit: 10 });
      assert.equal(result.records.length, 1);
      assert.equal(result.errors.length, 0);
      const record = result.records[0]!;
      assert.equal(record.externalId, "caleprocure-0000099999");
      assert.equal(record.agency, "Dept of the CA Highway Patrol");
      assert.equal(record.type, "Bid");
      assert.equal(record.solicitationNumber, "0000099999");
      assert.equal(record.rawData?.providerPlatform, "cal_eprocure_peoplesoft");
      assert.deepEqual(record.rawData?.documentUrls, [
        "https://caleprocure.ca.gov/documents/specifications.pdf",
        "https://caleprocure.ca.gov/documents/addendum-1.pdf",
      ]);
      assert.ok(requests.some((request) => request.cookie?.includes("PS_TOKEN=test-session")));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns listing records when detail enrichment fails and keeps dates unknown", async () => {
    const originalFetch = globalThis.fetch;
    const listingWithoutDates = LISTING_FIXTURE.replace("12/31/2099 11:00AM PST", "");
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === CAL_EPROCURE_LISTING_URL) return new Response(listingWithoutDates, { status: 200 });
      throw new Error("simulated detail failure");
    };

    try {
      const provider = new CalEprocureProvider();
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.records.length, 1);
      assert.ok(result.errors.some((error) => /detail enrichment failed/i.test(error)));
      const record = result.records[0]!;
      assert.equal(record.postedDate.getTime(), 0);
      assert.equal(record.responseDeadline, undefined);
      assert.equal(record.rawData?.dateUnknown, true);
      assert.equal(record.rawData?.deadlineUnknown, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
