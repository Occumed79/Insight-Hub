import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { rfpDb } from "@workspace/db";
import {
  opportunitiesTable,
  opportunityIngestionRunsTable,
  opportunityStagingTable,
} from "@workspace/db/schema/rfp";
import { indexVectorDocuments, type VectorIndexStats } from "./vectorIndex";

const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 22 * 60 * 1000;
const PAGE_SIZE = 100;
const activeSyncs = new Set<string>();
const terminalStatuses = new Set([
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
]);

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref?.();
  });
}

async function waitForRun(runId: string): Promise<string | null> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const [run] = await rfpDb
      .select({ status: opportunityIngestionRunsTable.status })
      .from(opportunityIngestionRunsTable)
      .where(eq(opportunityIngestionRunsTable.id, runId))
      .limit(1);
    if (!run) return null;
    if (terminalStatuses.has(run.status)) return run.status;
    await wait(POLL_INTERVAL_MS);
  }
  return null;
}

async function indexAcceptedRunRecords(runId: string): Promise<VectorIndexStats> {
  const aggregate: VectorIndexStats = {
    attempted: 0,
    indexed: 0,
    provider: null,
    vectorStore: null,
    errors: [],
  };
  let cursor: string | null = null;

  for (;;) {
    const rows = await rfpDb
      .select({
        id: opportunityStagingTable.id,
        opportunityId: opportunityStagingTable.canonicalOpportunityId,
      })
      .from(opportunityStagingTable)
      .where(
        and(
          eq(opportunityStagingTable.runId, runId),
          eq(opportunityStagingTable.qualityStatus, "accepted"),
          cursor ? gt(opportunityStagingTable.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(opportunityStagingTable.id))
      .limit(PAGE_SIZE);

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.id ?? cursor;
    const opportunityIds = Array.from(
      new Set(
        rows
          .map((row) => row.opportunityId)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    );

    if (opportunityIds.length > 0) {
      const opportunities = await rfpDb
        .select()
        .from(opportunitiesTable)
        .where(inArray(opportunitiesTable.id, opportunityIds));

      const stats = await indexVectorDocuments(
        opportunities.map((opportunity) => ({
          id: `opportunity:${opportunity.id}`,
          text: [
            opportunity.title,
            opportunity.agency,
            opportunity.subAgency,
            opportunity.type,
            opportunity.naicsCode,
            opportunity.naicsDescription,
            opportunity.setAside,
            opportunity.placeOfPerformance,
            opportunity.description,
            opportunity.solicitationNumber,
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 16_000),
          payload: {
            documentType: "opportunity",
            opportunityId: opportunity.id,
            noticeId: opportunity.noticeId,
            title: opportunity.title,
            agency: opportunity.agency,
            source: opportunity.providerName,
            sourceUrl: opportunity.samUrl,
            solicitationNumber: opportunity.solicitationNumber,
            naicsCode: opportunity.naicsCode,
            status: opportunity.status,
            relevanceScore: opportunity.relevanceScore,
            userConfidence: opportunity.userConfidence,
          },
        })),
        { batchSize: 20 },
      );

      aggregate.attempted += stats.attempted;
      aggregate.indexed += stats.indexed;
      aggregate.provider ??= stats.provider;
      aggregate.vectorStore ??= stats.vectorStore;
      aggregate.errors.push(...stats.errors);
    }

    if (rows.length < PAGE_SIZE) break;
  }

  aggregate.errors = Array.from(new Set(aggregate.errors)).slice(0, 20);
  return aggregate;
}

export function scheduleOpportunityVectorSync(runId: string): void {
  if (!runId || activeSyncs.has(runId)) return;
  activeSyncs.add(runId);

  void (async () => {
    try {
      const status = await waitForRun(runId);
      if (status !== "completed" && status !== "completed_with_errors") {
        console.info(JSON.stringify({ event: "opportunity_vector_sync_skipped", runId, status }));
        return;
      }
      const stats = await indexAcceptedRunRecords(runId);
      console.info(JSON.stringify({ event: "opportunity_vector_sync_completed", runId, ...stats }));
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "opportunity_vector_sync_failed",
          runId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      activeSyncs.delete(runId);
    }
  })();
}
