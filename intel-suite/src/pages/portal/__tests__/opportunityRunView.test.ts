import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customFetch } from "../../../../../lib/api-client-react/src/custom-fetch";
import {
  isOpportunityRunActive,
  isOpportunityRunStale,
  opportunityApiErrorMessage,
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
    assert.equal(isOpportunityRunActive("cancelled"), false);
  });

  it("detects an abandoned run only after the persisted heartbeat is stale", () => {
    const now = new Date("2026-07-21T20:00:00Z");
    assert.equal(isOpportunityRunStale("2026-07-21T19:29:59Z", now), true);
    assert.equal(isOpportunityRunStale("2026-07-21T19:30:01Z", now), false);
    assert.equal(isOpportunityRunStale(null, now), false);
  });

  it("surfaces the API error instead of treating a failed request as empty data", () => {
    assert.equal(
      opportunityApiErrorMessage(
        new Error(
          "HTTP 500 Internal Server Error: Failed to fetch opportunities",
        ),
      ),
      "HTTP 500 Internal Server Error: Failed to fetch opportunities",
    );
    assert.equal(
      opportunityApiErrorMessage({ data: { error: "Database unavailable" } }),
      "Database unavailable",
    );
  });

  it("surfaces the API details field through generated-client errors", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: "Failed to fetch opportunities",
          details: "operator is not unique: - unknown",
        }),
        {
          status: 500,
          statusText: "Internal Server Error",
          headers: { "content-type": "application/json" },
        },
      );

    try {
      await assert.rejects(
        customFetch("/api/opportunities"),
        /HTTP 500 Internal Server Error: operator is not unique: - unknown/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
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
      providersTimedOut: 2,
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
      "Timeouts",
    ]);
  });

  it("appends top rejection categories and representative titles", () => {
    const metrics = opportunityRunMetrics({
      fetched: 94,
      staged: 94,
      accepted: 0,
      rejected: 94,
      duplicates: 0,
      created: 0,
      updated: 0,
      archived: 0,
      rejectionDiagnostics: {
        reasons: [
          {
            code: "missing_occumed_service_evidence",
            label: "No Occu-Med service evidence",
            count: 70,
          },
          {
            code: "missing_procurement_signal",
            label: "No procurement signal",
            count: 20,
          },
          {
            code: "hard_reject",
            label: "Hard-reject wording",
            count: 4,
          },
        ],
        samples: [
          {
            title: "Statewide office furniture replacement solicitation",
            provider: "publicPortalProviders",
            reasonLabel: "No Occu-Med service evidence",
          },
          {
            title: "Informational procurement landing page",
            provider: "sam_gov",
            reasonLabel: "No procurement signal",
          },
        ],
      },
    });
    assert.deepEqual(metrics.slice(10, 13), [
      ["Reject: No Occu-Med evidence", 70],
      ["Reject: No procurement signal", 20],
      ["Reject: Hard-reject wording", 4],
    ]);
    assert.deepEqual(metrics.slice(13), [
      [
        "Sample · No Occu-Med service evidence · publicPortalProviders",
        "Statewide office furniture replacement solicitation",
      ],
      [
        "Sample · No procurement signal · sam_gov",
        "Informational procurement landing page",
      ],
    ]);
  });
});
