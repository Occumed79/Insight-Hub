import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOpportunityRunActive,
  opportunityRunMetrics,
  opportunityRunProgress,
} from "../opportunityRunView";

describe("persisted opportunity run view", () => {
  it("polls only queued and running statuses as active", () => {
    assert.equal(isOpportunityRunActive("queued"), true);
    assert.equal(isOpportunityRunActive("running"), true);
    assert.equal(isOpportunityRunActive("completed"), false);
    assert.equal(isOpportunityRunActive("completed_with_errors"), false);
    assert.equal(isOpportunityRunActive("failed"), false);
  });

  it("calculates bounded provider progress", () => {
    assert.equal(opportunityRunProgress(2, 4), 50);
    assert.equal(opportunityRunProgress(0, 0), 0);
    assert.equal(opportunityRunProgress(6, 4), 100);
  });

  it("exposes every required persisted counter", () => {
    const labels = opportunityRunMetrics({
      fetched: 9,
      staged: 8,
      accepted: 5,
      rejected: 2,
      duplicates: 1,
      created: 3,
      updated: 2,
      archived: 4,
      providerErrors: [{}],
    }).map(([label]) => label);
    assert.deepEqual(labels, [
      "Fetched",
      "Staged",
      "Accepted",
      "Rejected",
      "Duplicates",
      "Created",
      "Updated",
      "Archived",
      "Errors",
    ]);
  });
});
