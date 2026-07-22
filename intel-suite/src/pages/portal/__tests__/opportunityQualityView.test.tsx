import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QualityViewTabs, opportunityBriefAction, qualityViewStatusFilter, type OpportunityQualityViewMode } from "../opportunities";

describe("Opportunities rendered quality views", () => {
  it("renders quality tabs and lets interactions switch views", () => {
    let selected: OpportunityQualityViewMode = "actionable";
    const element = QualityViewTabs({ value: selected, onChange: (value) => { selected = value; } });
    const html = renderToStaticMarkup(element);
    assert.match(html, /Open &amp; Verified/);
    assert.match(html, /Needs Verification/);
    assert.match(html, /Closed\/Archived/);
    const buttons = React.Children.toArray((element.props as any).children) as any[];
    buttons[1].props.onClick();
    assert.equal(selected, "needs-verification");
  });

  it("prevents contradictory status filters outside the all-records view", () => {
    assert.equal(qualityViewStatusFilter("actionable", "archived"), "all");
    assert.equal(qualityViewStatusFilter("closed", "active"), "all");
    assert.equal(qualityViewStatusFilter("all", "archived"), "archived");
  });

  it("blocks discovery briefs but allows authoritative source verification", () => {
    assert.deepEqual(
      opportunityBriefAction({ quality: { classification: "discovery-only", sourceType: "search-discovery", summaryEligible: false } }),
      { enabled: false, label: "Verify before AI brief" },
    );
    assert.deepEqual(
      opportunityBriefAction({ quality: { classification: "verified-open", sourceType: "verified-solicitation-page", summaryEligible: false } }),
      { enabled: true, label: "Verify source & build brief" },
    );
  });
});
