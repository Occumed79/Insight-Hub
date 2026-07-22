import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOpportunityQualityPage, canonicalSamOpportunityUrl, classifyOpportunityQuality, deadlineEndForComparison, opportunityQualityRank, summaryEvidenceFingerprint, summaryIneligibilityReason } from "../opportunityQuality";

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

  it("does not classify active RFP boilerplate award language as an award", () => {
    assert.equal(classifyOpportunityQuality({ ...base, description: "The City may award a contract to the highest scoring proposer. Evaluation includes award criteria." }, now).classification, "verified-open");
  });

  it("classifies a real award notice as an award", () => {
    assert.equal(classifyOpportunityQuality({ ...base, title: "Notice of Award - Occupational Health Services", description: "Contract awarded to Acme Medical." }, now).classification, "award");
  });

  it("does not classify official unknown-posted-date records with future deadlines as discovery-only", () => {
    const quality = classifyOpportunityQuality({ ...base, postedDate: null, tags: ["date-unknown"] }, now);
    assert.notEqual(quality.classification, "discovery-only");
    assert.equal(quality.classification, "verified-open");
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

  it("does not canonicalize lookalike SAM.gov hostnames", () => {
    assert.equal(
      canonicalSamOpportunityUrl("https://notasam.gov/opp/example/view"),
      "https://notasam.gov/opp/example/view",
    );
  });

  it("filters, deduplicates, counts, and paginates after quality classification", () => {
    const rows = Array.from({ length: 1105 }, (_, index) => ({
      ...base,
      id: `row-${index}`,
      title: `RFP Occupational Health Services ${index}`,
      responseDeadline: index % 2 === 0 ? new Date("2026-08-15") : new Date("2026-06-01"),
      samUrl: `https://sam.gov/opp/example-${index}/view`,
    }));
    rows.push({ ...base, id: "ost-a", title: "Q--Presolicitation Notice for OST HRP - SAM.gov", samUrl: "https://sam.gov/workspace/contract/opp/9aec430f1de94cd7bf7687f515b55ed8/view" });
    rows.push({ ...base, id: "ost-b", title: "Q--Presolicitation Notice for OST HRP - SAM.gov", samUrl: "https://sam.gov/opp/9aec430f1de94cd7bf7687f515b55ed8/view" });
    const page = buildOpportunityQualityPage(rows, "actionable", 56, 10, now);
    assert.equal(page.total, 554);
    assert.ok(page.data.length > 0);
    assert.ok(page.data.every((row) => row.quality.classification === "verified-open"));
  });

  it("does not collapse identical solicitation numbers from different agencies", () => {
    const rows = [
      { ...base, id: "city-a", agency: "City A", solicitationNumber: "RFP-2026-01", samUrl: "https://sam.gov/opp/city-a/view" },
      { ...base, id: "city-b", agency: "City B", solicitationNumber: "RFP-2026-01", samUrl: "https://sam.gov/opp/city-b/view" },
    ];
    assert.equal(buildOpportunityQualityPage(rows, "actionable", 1, 10, now).total, 2);
  });

  it("keeps date-only deadlines open through the Pacific calendar day", () => {
    const summerEnd = deadlineEndForComparison("2026-07-21")!;
    const winterEnd = deadlineEndForComparison("2026-12-21")!;
    assert.equal(summerEnd.toISOString(), "2026-07-22T06:59:59.999Z");
    assert.equal(winterEnd.toISOString(), "2026-12-22T07:59:59.999Z");
    assert.equal(classifyOpportunityQuality({ ...base, responseDeadline: "2026-07-21" }, new Date("2026-07-22T06:30:00.000Z")).classification, "verified-open");
    assert.equal(deadlineEndForComparison("2026-07-21T15:00:00-07:00")!.toISOString(), "2026-07-21T22:00:00.000Z");
  });

  it("returns structured summary ineligibility reasons", () => {
    assert.equal(summaryIneligibilityReason(classifyOpportunityQuality({ ...base, providerName: "serper", tags: ["ai-pending"] }, now), false), "discovery_only");
    assert.equal(summaryIneligibilityReason(classifyOpportunityQuality({ ...base, responseDeadline: null }, now), false), "future_deadline_unverified");
  });

  it("marks summary eligibility and stale fingerprints deterministically", () => {
    const eligible = classifyOpportunityQuality(base, now);
    const ineligible = classifyOpportunityQuality({ ...base, responseDeadline: null }, now);
    const changed = classifyOpportunityQuality({ ...base, responseDeadline: new Date("2026-09-01") }, now);
    assert.equal(eligible.summaryEligible, true);
    assert.equal(ineligible.summaryEligible, false);
    assert.notEqual(eligible.evidenceFingerprint, changed.evidenceFingerprint);
    assert.notEqual(
      eligible.evidenceFingerprint,
      classifyOpportunityQuality({ ...base, estimatedValue: "25000" }, now).evidenceFingerprint,
    );
  });

  it("does not treat a .gov URL alone as sufficient summary evidence", () => {
    const officialPage = classifyOpportunityQuality({
      ...base,
      providerName: "manual",
      samUrl: "https://example.gov/rfp/occupational-health",
    }, now);
    assert.equal(officialPage.classification, "needs-verification");
    assert.equal(officialPage.summaryEligible, false);
    assert.equal(summaryIneligibilityReason(officialPage, false), "record_not_actionable");
  });

  it("invalidates a summary fingerprint when canonical facts or source content change", () => {
    const quality = classifyOpportunityQuality(base, now);
    const changedValue = classifyOpportunityQuality({ ...base, estimatedValue: "25000" }, now);
    assert.notEqual(summaryEvidenceFingerprint(quality, "content-a"), summaryEvidenceFingerprint(changedValue, "content-a"));
    assert.notEqual(summaryEvidenceFingerprint(quality, "content-a"), summaryEvidenceFingerprint(quality, "content-b"));
  });

  it("covers assessment regression fixtures", () => {
    assert.equal(classifyOpportunityQuality({ ...base, title: "Occupational Health Services (RFP) - Township of Wayne Bid & RFP - Due Jun 17, 2026 | Starbridge", providerName: "serper", samUrl: "https://starbridge.ai/rfp/occupational-health-services-rfp-10", status: "archived", responseDeadline: new Date("2026-06-17") }, now).classification, "archived");
    assert.equal(classifyOpportunityQuality({ ...base, title: "Q--Presolicitation Notice for OST HRP - SAM.gov", agency: "occupational health", responseDeadline: null, samUrl: "https://sam.gov/workspace/contract/opp/9aec430f1de94cd7bf7687f515b55ed8/view" }, now).classification, "needs-verification");
  });
});
