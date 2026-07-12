import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scorePortalForOccuMed } from "../portalRelevance";

describe("portal relevance scoring", () => {
  it("classifies verified, likely, broad, and irrelevant portal fit", () => {
    assert.equal(
      scorePortalForOccuMed({
        name: "City Purchasing",
        isOfficialPortal: true,
        officialPageText: "Official procurement bids and RFPs",
        archivedSolicitationTitles: ["RFP Occupational Health Services"],
        evidenceUrls: ["https://city.gov/rfp"],
      }).fit,
      "verified_high",
    );
    assert.equal(
      scorePortalForOccuMed({
        name: "Fire Authority Purchasing",
        isOfficialPortal: true,
        officialPageText: "Official procurement solicitations",
        archivedSolicitationTitles: [
          "NFPA 1582 firefighter medical examination services RFP",
        ],
        evidenceUrls: ["https://fire.gov/rfp"],
      }).fit,
      "verified_high",
    );
    assert.equal(
      scorePortalForOccuMed({
        name: "Large County Procurement",
        jurisdiction:
          "Large county with centralized HR, public safety, DOT, utilities and commercial drivers",
        isOfficialPortal: true,
        officialPageText: "Official procurement and purchasing solicitations",
      }).fit,
      "likely",
    );
    assert.match(
      scorePortalForOccuMed({
        name: "School District Purchasing",
        isOfficialPortal: true,
        officialPageText: "Official purchasing bids and vendor registration",
      }).fit,
      /broad|insufficient_evidence/,
    );
    assert.equal(
      scorePortalForOccuMed({
        name: "Bid Aggregator",
        isAggregatorMarketplace: true,
      }).fit,
      "irrelevant",
    );
  });
});
