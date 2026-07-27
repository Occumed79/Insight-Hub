import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseOpenGovProjectListHtml } from "../openGovHtml";
import type { OpenGovTenant } from "../openGov";

const tenant: OpenGovTenant = {
  portalId: "test-opengov",
  tenantSlug: "example",
  buyerName: "Example County",
  state: "CA",
  capability: "dedicated_listing_and_detail",
};

describe("OpenGov HTML adapter", () => {
  it("parses server-rendered project rows", () => {
    const html = `
      <table>
        <tbody>
          <tr>
            <td><a href="/portal/example/project/12345">Employee Health Services RFP</a></td>
            <td>RFP-2026-15</td>
            <td>Open</td>
            <td>0</td>
            <td>07/01/2026</td>
            <td>08/15/2026</td>
          </tr>
        </tbody>
      </table>
    `;
    const records = parseOpenGovProjectListHtml(html, tenant);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.externalId, "opengov-example-12345");
    assert.equal(records[0]?.title, "Employee Health Services RFP");
    assert.equal(records[0]?.solicitationNumber, "RFP-2026-15");
    assert.equal(records[0]?.status, "active");
    assert.equal(
      records[0]?.sourceUrl,
      "https://procurement.opengov.com/portal/example/project/12345",
    );
  });
});
