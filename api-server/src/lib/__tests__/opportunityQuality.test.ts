import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalSamOpportunityUrl, classifyOpportunityQuality, opportunityQualityRank } from "../opportunityQuality";

const now = new Date("2026-07-21T19:00:00.000Z");
const base = {
  title: "RFP Occupational Health Services",
  agency: "City of Example",
  type: "Solicitation",
  status: "active",
  postedDate: new Date("2026-07-01T00:00:00.000Z"),
  responseDeadline: new Date("2026-08-15T00:00:00.000Z"),
  description: "Request for proposal for occupational health services and drug testing.",
  samUrl: "https://sam.gov/opp/example/view",
  providerName: "samGov",
  sourceConfidence: "high",
  relevanceScore: "85",
};

describe("opportunity quality classifier", () => {
  it("includes a future direct authoritative solicitation as verified-open", () => {
    assert.equal(classifyOpportunityQuality(base, now).classification, "verified-open");
  });

  it("excludes past deadlines and archived records from verified-open", () => {
    assert.equal(classifyOpportunityQuality({ ...base, responseDeadline: new Date("2026-06-16") }, now).classification, "closed");
    assert.equal(classifyOpportunityQuality({ ...base, status: "archived" }, now).classification, "archived");
  });

  it("classifies forecasts, awards, tabulations, purchase orders, and contract documents", () => {
    assert.equal(classifyOpportunityQuality({ ...base, title: "Forecast Record | Acquisition Planning Forecast System", samUrl: "https://apfs-cloud.dhs.gov/record/73073/public-print/" }, now).classification, "forecast");
    assert.equal(classifyOpportunityQuality({ ...base, title: "Health and Human Services Commission Purchase Order", samUrl: "https://contracts.hhs.texas.gov/sites/default/files/documents/386532-contract.pdf" }, now).classification, "award");
    assert.equal(classifyOpportunityQuality({ ...base, title: "Bid Tabulation for Occupational Health" }, now).classification, "award");
  });

  it("sends deadline-unknown official postings to needs-verification", () => {
    assert.equal(classifyOpportunityQuality({ ...base, responseDeadline: null }, now).classification, "needs-verification");
  });

  it("keeps Serper/Exa and snippet-only aggregator records discovery-only even with snippet deadlines", () => {
    const berkeley = { ...base, title: "Occupational Health Services - The City of Berkeley", providerName: "serper", sourceConfidence: "low", responseDeadline: null, description: "... Occupational Health Services. As a Request for Proposal ...", samUrl: "https://berkeleyca.gov/doing-business/working-city/bid-proposal-opportunities/occupational-health-services", tags: ["occupational health", "ai-pending"] };
    const higherGov = { ...base, title: "Occupational Health and Medical Services Support", agency: "City of Raleigh, North Carolina", providerName: "serper", samUrl: "https://www.highergov.com/sl/contract-opportunity/nc-occupational-health-and-medical-services-57865951/", responseDeadline: new Date("2026-08-01"), description: "Snippet says proposals due August 1, 2026" };
    assert.equal(classifyOpportunityQuality(berkeley, now).classification, "discovery-only");
    assert.equal(classifyOpportunityQuality(higherGov, now).classification, "discovery-only");
  });

  it("ranks verified-open before weaker classifications", () => {
    const verified = classifyOpportunityQuality(base, now);
    const weakOpp = { ...base, providerName: "exa", tags: ["ai-pending"], relevanceScore: "100" };
    const weak = classifyOpportunityQuality(weakOpp, now);
    assert.equal(weak.classification, "discovery-only");
    assert.ok(opportunityQualityRank(base, verified, now) > opportunityQualityRank(weakOpp, weak, now));
  });

  it("normalizes equivalent SAM.gov opportunity URL forms", () => {
    assert.equal(
      canonicalSamOpportunityUrl("https://sam.gov/workspace/contract/opp/9aec430f1de94cd7bf7687f515b55ed8/view"),
      "https://sam.gov/opp/9aec430f1de94cd7bf7687f515b55ed8/view",
    );
  });

  it("marks summary eligibility and stale fingerprints deterministically", () => {
    const eligible = classifyOpportunityQuality(base, now);
    const ineligible = classifyOpportunityQuality({ ...base, responseDeadline: null }, now);
    const changed = classifyOpportunityQuality({ ...base, responseDeadline: new Date("2026-09-01") }, now);
    assert.equal(eligible.summaryEligible, true);
    assert.equal(ineligible.summaryEligible, false);
    assert.notEqual(eligible.evidenceFingerprint, changed.evidenceFingerprint);
  });

  it("covers assessment regression fixtures", () => {
    assert.equal(classifyOpportunityQuality({ ...base, title: "Occupational Health Services (RFP) - Township of Wayne Bid & RFP - Due Jun 17, 2026 | Starbridge", providerName: "serper", samUrl: "https://starbridge.ai/rfp/occupational-health-services-rfp-10", status: "archived", responseDeadline: new Date("2026-06-17") }, now).classification, "archived");
    assert.equal(classifyOpportunityQuality({ ...base, title: "Q--Presolicitation Notice for OST HRP - SAM.gov", agency: "occupational health", responseDeadline: null, samUrl: "https://sam.gov/workspace/contract/opp/9aec430f1de94cd7bf7687f515b55ed8/view" }, now).classification, "needs-verification");
  });
});
