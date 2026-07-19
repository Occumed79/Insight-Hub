import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STATEWIDE_PORTAL_CONFIGS } from "../statewideProcurementConfigs";
import { parseStatewidePlatformListings } from "../statewideProcurementPlatformParsers";

function config(portalId: string) {
  const found = STATEWIDE_PORTAL_CONFIGS.find((item) => item.portalId === portalId);
  assert.ok(found, `missing config ${portalId}`);
  return found;
}

const DE = config("de-mymarketplace");

describe("statewide platform parsers", () => {
  it("parses Delaware's official Socrata open-bids dataset", () => {
    const payload = JSON.stringify([
      {
        contractnumber: "DE-2099-100",
        contracttitle: "Occupational health examination services",
        opendate: "2099-01-01T00:00:00.000",
        deadlinedate: "2099-12-31T00:00:00.000",
        agencycode: "OMB",
        unspsc: "85120000",
        bidurl: "https://mmp.delaware.gov/Bids/Details/DE-2099-100",
      },
      {
        contractnumber: "DE-2020-OLD",
        contracttitle: "Expired services",
        deadlinedate: "2020-01-01T00:00:00.000",
      },
    ]);
    const rows = parseStatewidePlatformListings(payload, DE, DE.listingUrl, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.nativeId, "DE-2099-100");
    assert.equal(rows[0]!.agency, "OMB");
    assert.equal(rows[0]!.detailUrl, "https://mmp.delaware.gov/Bids/Details/DE-2099-100");
    assert.equal(rows[0]!.responseDeadline?.getUTCFullYear(), 2099);
  });
});
