import "./support/useFixtureProfile";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyProviderRecordRelevance } from "../../providers/providerQueryMatch";
import type { NormalizedOpportunity } from "../../providers/types";
import { isDeterministicallyActionable } from "../structuredOpportunityDecision";
import { GOLDEN_CASES } from "./goldenSet";

function toRecord(c: (typeof GOLDEN_CASES)[number]): NormalizedOpportunity {
  return {
    externalId: c.id,
    title: c.title,
    agency: c.agency,
    type: /^Award/i.test(c.title) ? "Award Notice" : "Solicitation",
    status: "active",
    naicsCode: c.naicsCode,
    postedDate: new Date(),
    responseDeadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    description: c.description,
    sourceUrl: `https://sam.gov/opp/${c.id}/view`,
    source: "tango",
    rawData: {},
  };
}

describe("Occu-Med relevance gate golden set", () => {
  for (const c of GOLDEN_CASES) {
    it(`${c.wanted ? "keeps" : "drops"}: ${c.id}`, () => {
      const record = toRecord(c);
      const relevance = classifyProviderRecordRelevance(record);
      if (c.wanted) {
        assert.equal(relevance.rejected, false, `wanted notice was rejected: ${relevance.rejectReason}`);
        assert.equal(isDeterministicallyActionable(record), true, "wanted notice not actionable");
      } else {
        assert.ok(
          relevance.rejected || !isDeterministicallyActionable(record),
          `unwanted notice passed the gate (score ${relevance.score})`,
        );
      }
    });
  }
});
