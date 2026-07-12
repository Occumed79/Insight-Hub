import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStatePortalSearchPlan,
  STATE_PORTALS,
} from "../statePortals";

describe("state portal query planner", () => {
  it("keeps every eligible portal in the complete plan", () => {
    const plan = buildStatePortalSearchPlan({
      includeTier3: true,
      fullCoverage: true,
      rotationKey: "coverage-test",
    });
    const plannedIds = new Set(
      plan.allQueries.flatMap((query) => query.portalIds),
    );
    const eligibleIds = new Set(STATE_PORTALS.map((portal) => portal.sourceId));

    assert.equal(plan.diagnostics.eligiblePortalCount, eligibleIds.size);
    assert.equal(plan.diagnostics.deferredPortalCount, 0);
    assert.equal(plan.diagnostics.selectedPortalCount, eligibleIds.size);
    assert.deepEqual([...plannedIds].sort(), [...eligibleIds].sort());
  });

  it("uses a finite rotating execution budget without imposing a source cap", () => {
    const first = buildStatePortalSearchPlan({
      includeTier3: true,
      executionBudget: 6,
      rotationKey: "2026-07-12T01",
    });
    const second = buildStatePortalSearchPlan({
      includeTier3: true,
      executionBudget: 6,
      rotationKey: "2026-07-12T02",
    });

    assert.equal(first.diagnostics.selectedQueryCount, 6);
    assert.equal(second.diagnostics.selectedQueryCount, 6);
    assert.equal(
      first.diagnostics.selectedPortalCount +
        first.diagnostics.deferredPortalCount,
      first.diagnostics.eligiblePortalCount,
    );
    assert.equal(
      second.diagnostics.selectedPortalCount +
        second.diagnostics.deferredPortalCount,
      second.diagnostics.eligiblePortalCount,
    );
    assert.notEqual(first.diagnostics.rotationKey, second.diagnostics.rotationKey);
    assert.ok(first.diagnostics.fullPlannedQueryCount >= 6);
  });

  it("supplements ontology queries with user keywords", () => {
    const plan = buildStatePortalSearchPlan({
      includeTier3: true,
      executionBudget: 1,
      keywords: "Fresno County",
      rotationKey: "keyword-test",
    });
    assert.equal(plan.selectedQueries.length, 1);
    assert.match(plan.selectedQueries[0].query, /Fresno County/);
    assert.match(plan.selectedQueries[0].query, /site:/);
  });

  it("batches domains into bounded search expressions", () => {
    const plan = buildStatePortalSearchPlan({
      includeTier3: true,
      fullCoverage: true,
      rotationKey: "length-test",
    });
    for (const query of plan.allQueries) {
      assert.ok(query.domains.length <= 6);
      assert.ok(query.query.length < 2_500);
    }
  });
});
