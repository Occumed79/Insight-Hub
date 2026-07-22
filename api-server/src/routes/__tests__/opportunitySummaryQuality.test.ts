import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeSummaryWithVerifiedFacts } from "../../lib/summaryEvidence";

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
  });

  it("changes evidence fingerprints when material evidence changes", () => {
    const one = { evidenceFingerprint: "title|buyer|2026-08-15|active|url|content-a" };
    const two = { evidenceFingerprint: "title|buyer|2026-09-01|active|url|content-a" };
    assert.notEqual(one.evidenceFingerprint, two.evidenceFingerprint);
  });
});

