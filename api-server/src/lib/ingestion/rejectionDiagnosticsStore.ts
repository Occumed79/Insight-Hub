import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { rfpDb } from "@workspace/db";
import { opportunityStagingTable } from "@workspace/db/schema/rfp";
import {
  buildIngestionRejectionDiagnostics,
  type IngestionRejectionDiagnostics,
  type RejectionReasonCountRow,
  type RejectionSampleRow,
} from "./rejectionDiagnostics";

const REJECTED_QUALITY_STATUSES = ["rejected", "quarantined"] as const;

export async function getIngestionRejectionDiagnostics(
  runId: string,
): Promise<IngestionRejectionDiagnostics> {
  const where = and(
    eq(opportunityStagingTable.runId, runId),
    inArray(opportunityStagingTable.qualityStatus, [
      ...REJECTED_QUALITY_STATUSES,
    ]),
  );

  const [reasonRows, sampleRows] = await Promise.all([
    rfpDb
      .select({
        qualityStatus: opportunityStagingTable.qualityStatus,
        qualityReason: opportunityStagingTable.qualityReason,
        count: sql<number>`count(*)::int`,
      })
      .from(opportunityStagingTable)
      .where(where)
      .groupBy(
        opportunityStagingTable.qualityStatus,
        opportunityStagingTable.qualityReason,
      )
      .orderBy(desc(sql`count(*)`)),
    // Manual ingestion is already bounded by provider result limits. Fetch all
    // rejected rows for this run so a large recent reason group cannot hide
    // representative titles from smaller or older reason groups.
    rfpDb
      .select({
        provider: opportunityStagingTable.provider,
        title: opportunityStagingTable.title,
        agency: opportunityStagingTable.agency,
        qualityStatus: opportunityStagingTable.qualityStatus,
        qualityReason: opportunityStagingTable.qualityReason,
        completenessScore: opportunityStagingTable.completenessScore,
        sourceConfidence: opportunityStagingTable.sourceConfidence,
      })
      .from(opportunityStagingTable)
      .where(where)
      .orderBy(desc(opportunityStagingTable.createdAt)),
  ]);

  return buildIngestionRejectionDiagnostics(
    reasonRows as RejectionReasonCountRow[],
    sampleRows as RejectionSampleRow[],
  );
}
