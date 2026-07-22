import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../opportunities.tsx", import.meta.url), "utf8");

describe("Opportunities quality views", () => {
  it("uses actionable results for the default frontend request", () => {
    assert.match(source, /qualityView.*useState<[^>]+>\("actionable"\)/s);
    assert.match(source, /view:\s*qualityView as any/);
  });

  it("separates needs verification and closed views visually", () => {
    assert.match(source, /Open & Verified/);
    assert.match(source, /Needs Verification/);
    assert.match(source, /Closed\/Archived/);
  });

  it("does not offer an active AI brief action for ineligible cards", () => {
    assert.match(source, /canViewAiBrief\(opp\) \? "View AI brief" : "Verify before AI brief"/);
    assert.match(source, /if \(canViewAiBrief\(opp\)\) handleOpenSummary\(opp\)/);
  });

  it("shows source evidence type labels", () => {
    assert.match(source, /Official\/direct/);
    assert.match(source, /Search\/discovery/);
    assert.match(source, /Aggregator/);
  });
});
