import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeSummaryWithVerifiedFacts } from "../../lib/summaryEvidence";
import { classifyOpportunityQuality, summaryEvidenceFingerprint } from "../../lib/opportunityQuality";

describe("opportunity summary evidence merge", () => {
  it("does not allow AI output to replace verified buyer, deadline, or value", () => {
    const base = {
      summary: "Verified summary",
      occumedFit: "Verified fit",
      serviceLines: ["Occupational health"],
      keyDates: { posted: "2026-07-01", due: "2026-08-15" },
      buyer: "City of Example",
      estimatedValue: "$25.0K",
      solicitationType: "Solicitation",
      classification: "verified-open",
      sourceUrl: "https://sam.gov/opp/example/view",
      bidNotes: [],
      missingInfo: [],
      fitVerdict: "Strong fit after source verification",
      confidence: "high",
      evidenceFingerprint: "fp-1",
    };
    const merged = mergeSummaryWithVerifiedFacts({ buyer: "Wrong Buyer", keyDates: { posted: "2020-01-01", due: "2020-01-02" }, estimatedValue: "$999M", summary: "Narrative" }, base, "test");
    assert.equal(merged.buyer, "City of Example");
    assert.deepEqual(merged.keyDates, { posted: "2026-07-01", due: "2026-08-15" });
    assert.equal(merged.estimatedValue, "$25.0K");
    assert.equal(merged.evidenceSource, undefined);
  });

  it("keeps the deterministic fit and full response shape for vague model output", () => {
    const base = {
      summary: "Verified summary",
      occumedFit: "Strong fit for occupational medicine services",
      serviceLines: ["Occupational health"],
      keyDates: { posted: "2026-07-01", due: "2026-08-15" },
      buyer: "City of Example",
      evidenceSource: "official-direct",
      sourceAuthority: "trusted",
      eligible: true,
      evidenceFingerprint: "fp-1",
    };
    const merged = mergeSummaryWithVerifiedFacts(
      { occumedFit: "This may fit general occupational health" },
      base,
      "test",
    );
    assert.equal(merged.occumedFit, base.occumedFit);
    assert.equal(merged.evidenceSource, "official-direct");
    assert.equal(merged.sourceAuthority, "trusted");
    assert.equal(merged.eligible, true);
  });

  it("changes evidence fingerprints when material evidence changes", () => {
    const base = {
      title: "RFP Occupational Health Services",
      agency: "City of Example",
      type: "Solicitation",
      status: "active",
      postedDate: new Date("2026-07-01"),
      responseDeadline: new Date("2026-08-15"),
      description: "Request for proposal for occupational health services.",
      samUrl: "https://sam.gov/opp/example/view",
      providerName: "samGov",
      sourceConfidence: "high",
    };
    const one = summaryEvidenceFingerprint(classifyOpportunityQuality(base), "content-a");
    const two = summaryEvidenceFingerprint(
      classifyOpportunityQuality({ ...base, responseDeadline: new Date("2026-09-01") }),
      "content-a",
    );
    assert.notEqual(one, two);
  });
});
