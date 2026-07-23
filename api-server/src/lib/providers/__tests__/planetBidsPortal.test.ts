import assert from "node:assert/strict";
import test from "node:test";

import {
  PLANETBIDS_COLLECTIBLE_PORTAL_IDS,
  PLANETBIDS_TENANTS,
  parsePlanetBidsListingHtml,
  planetBidsListingUrl,
  planetBidsRowToOpportunity,
} from "../planetBidsPortal";

const fresno = PLANETBIDS_TENANTS.find(
  (tenant) => tenant.portalId === "ca-fresno",
);
assert.ok(fresno);

const fixture = `
<table>
  <tr>
    <th>Posted</th><th>Title</th><th>Invitation</th><th>Due</th><th>Status</th>
  </tr>
  <tr>
    <td>07/15/2026</td>
    <td><a href="/portal/14769/bo/bo-detail/142345">Occupational Health Medical Testing Services</a></td>
    <td>RFP-26-104</td>
    <td>08/12/2026 3:00 PM (PDT)</td>
    <td>Open</td>
  </tr>
  <tr>
    <td>07/10/2026</td>
    <td><a href="/portal/99999/bo/bo-detail/ignored">Other Buyer Opportunity</a></td>
    <td>RFP-OTHER</td>
    <td>08/01/2026</td>
    <td>Open</td>
  </tr>
</table>`;

test("PlanetBids shared adapter parses only its configured buyer rows", () => {
  assert.deepEqual(
    [...PLANETBIDS_COLLECTIBLE_PORTAL_IDS].sort(),
    ["ca-fresno", "ca-imperial-county", "ca-irvine"],
  );
  assert.equal(
    planetBidsListingUrl(fresno),
    "https://vendors.planetbids.com/portal/14769/bo/bo-search",
  );

  const rows = parsePlanetBidsListingHtml(fixture, fresno);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.bidId, "142345");
  assert.equal(rows[0]?.title, "Occupational Health Medical Testing Services");
  assert.equal(rows[0]?.solicitationNumber, "RFP-26-104");
  assert.equal(rows[0]?.postedDate, "07/15/2026");
  assert.match(rows[0]?.responseDeadline ?? "", /08\/12\/2026/);
  assert.equal(
    rows[0]?.detailUrl,
    "https://vendors.planetbids.com/portal/14769/bo/bo-detail/142345",
  );

  const opportunity = planetBidsRowToOpportunity(rows[0]!, fresno);
  assert.equal(opportunity.externalId, "planetbids-14769-142345");
  assert.equal(opportunity.agency, "City of Fresno");
  assert.equal(opportunity.type, "RFP");
  assert.equal(opportunity.solicitationNumber, "RFP-26-104");
  assert.equal(opportunity.rawData?.sourceId, "ca-fresno");
  assert.equal(opportunity.rawData?.providerPlatform, "planetbids");
});
