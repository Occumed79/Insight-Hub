import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const INGESTION_OPERATIONS = [
  "fetchOpportunities",
  "getCurrentOpportunityIngestionRun",
  "listOpportunityIngestionRuns",
  "getOpportunityIngestionRun",
  "retryFailedOpportunityProviders",
  "reconcileExpiredOpportunities",
];

describe("generated ingestion API coverage", () => {
  it("contains every persisted manual-ingestion operation and its generated run types", async () => {
    const [reactClient, zodClient, zodTypes] = await Promise.all([
      readFile(
        path.resolve(
          process.cwd(),
          "../lib/api-client-react/src/generated/api.ts",
        ),
        "utf8",
      ),
      readFile(
        path.resolve(process.cwd(), "../lib/api-zod/src/generated/api.ts"),
        "utf8",
      ),
      readFile(
        path.resolve(
          process.cwd(),
          "../lib/api-zod/src/generated/types/index.ts",
        ),
        "utf8",
      ),
    ]);

    for (const operation of INGESTION_OPERATIONS) {
      assert.ok(
        reactClient.includes(operation),
        `missing React client ${operation}`,
      );
    }
    for (const contract of [
      "GetCurrentOpportunityIngestionRunResponse",
      "ListOpportunityIngestionRunsResponse",
      "GetOpportunityIngestionRunResponse",
      "ReconcileExpiredOpportunitiesResponse",
    ])
      assert.ok(
        zodClient.includes(contract),
        `missing Zod contract ${contract}`,
      );
    for (const generatedType of [
      '"./ingestionRun"',
      '"./ingestionRunSource"',
      '"./ingestionRunStarted"',
      '"./reconcileExpiredOpportunities200"',
    ])
      assert.ok(
        zodTypes.includes(generatedType),
        `missing generated type ${generatedType}`,
      );
  });
});
