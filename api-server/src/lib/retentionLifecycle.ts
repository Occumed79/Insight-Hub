import { sql } from "drizzle-orm";
import { rfpDb } from "@workspace/db";

export const RETENTION_POLICY_VERSION = "2026-08-v1";

export type RetentionPolicy = {
  stagingDays: number;
  rawDays: number;
  runDays: number;
};

export type RetentionPreview = {
  policyVersion: string;
  generatedAt: string;
  policy: RetentionPolicy;
  cutoffs: {
    stagingBefore: string;
    rawBefore: string;
    runBefore: string;
  };
  candidates: {
    opportunitiesToArchive: number;
    stagingRowsToPrune: number;
    rawRowsToPrune: number;
    ingestionRunsToPrune: number;
  };
  preserved: {
    canonicalOpportunities: true;
    feedback: true;
    sourceRegistry: true;
    dedupeKeys: true;
    latestRawEvidence: true;
    pendingStaging: true;
  };
};

export type RetentionApplyResult = RetentionPreview & {
  appliedAt: string;
  applied: {
    opportunitiesArchived: number;
    stagingRowsPruned: number;
    rawRowsPruned: number;
    ingestionRunsPruned: number;
  };
};

const TERMINAL_RUN_STATUSES = [
  "completed",
  "completed_with_errors",
  "cancelled",
  "failed",
] as const;

function boundedDays(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

export function retentionPolicy(): RetentionPolicy {
  return {
    stagingDays: boundedDays("INSIGHT_RETENTION_STAGING_DAYS", 30, 7, 365),
    rawDays: boundedDays("INSIGHT_RETENTION_RAW_DAYS", 90, 30, 730),
    runDays: boundedDays("INSIGHT_RETENTION_RUN_DAYS", 180, 60, 1460),
  };
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

function countFrom(result: unknown): number {
  const rows = (result as { rows?: Array<{ count?: unknown }> })?.rows;
  const value = rows?.[0]?.count;
  return Number(value ?? 0) || 0;
}

function affectedRows(result: unknown): number {
  const direct = (result as { rowCount?: unknown })?.rowCount;
  if (typeof direct === "number") return direct;
  const rows = (result as { rows?: unknown[] })?.rows;
  return Array.isArray(rows) ? rows.length : 0;
}

function terminalStatusSql() {
  return sql.join(
    TERMINAL_RUN_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  );
}

async function previewWithExecutor(
  executor: Pick<typeof rfpDb, "execute">,
  now: Date,
  policy: RetentionPolicy,
): Promise<RetentionPreview> {
  const stagingBefore = daysBefore(now, policy.stagingDays);
  const rawBefore = daysBefore(now, policy.rawDays);
  const runBefore = daysBefore(now, policy.runDays);

  const stagingWillSurvive = sql`
    staging.quality_status = 'pending'
    OR staging.updated_at >= ${stagingBefore}
  `;

  const rawWillSurvive = sql`
    raw.collected_at >= ${rawBefore}
    OR EXISTS (
      SELECT 1 FROM opportunity_source_registry registry
      WHERE registry.latest_raw_record_id = raw.id
    )
    OR EXISTS (
      SELECT 1 FROM opportunity_staging staging
      WHERE staging.raw_record_id = raw.id
        AND (${stagingWillSurvive})
    )
  `;

  const [opportunities, staging, raw, runs] = await Promise.all([
    executor.execute(sql`
      SELECT count(*)::int AS count
      FROM opportunities
      WHERE status = 'active'
        AND response_deadline IS NOT NULL
        AND response_deadline < ${now}
    `),
    executor.execute(sql`
      SELECT count(*)::int AS count
      FROM opportunity_staging
      WHERE quality_status <> 'pending'
        AND updated_at < ${stagingBefore}
    `),
    executor.execute(sql`
      SELECT count(*)::int AS count
      FROM opportunity_raw_records raw
      WHERE raw.collected_at < ${rawBefore}
        AND NOT EXISTS (
          SELECT 1 FROM opportunity_source_registry registry
          WHERE registry.latest_raw_record_id = raw.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM opportunity_staging staging
          WHERE staging.raw_record_id = raw.id
            AND (${stagingWillSurvive})
        )
    `),
    executor.execute(sql`
      SELECT count(*)::int AS count
      FROM opportunity_ingestion_runs run
      WHERE run.status IN (${terminalStatusSql()})
        AND coalesce(run.completed_at, run.updated_at) < ${runBefore}
        AND NOT EXISTS (
          SELECT 1 FROM opportunity_staging staging
          WHERE staging.run_id = run.id
            AND (${stagingWillSurvive})
        )
        AND NOT EXISTS (
          SELECT 1 FROM opportunity_raw_records raw
          WHERE raw.run_id = run.id
            AND (${rawWillSurvive})
        )
    `),
  ]);

  return {
    policyVersion: RETENTION_POLICY_VERSION,
    generatedAt: now.toISOString(),
    policy,
    cutoffs: {
      stagingBefore: stagingBefore.toISOString(),
      rawBefore: rawBefore.toISOString(),
      runBefore: runBefore.toISOString(),
    },
    candidates: {
      opportunitiesToArchive: countFrom(opportunities),
      stagingRowsToPrune: countFrom(staging),
      rawRowsToPrune: countFrom(raw),
      ingestionRunsToPrune: countFrom(runs),
    },
    preserved: {
      canonicalOpportunities: true,
      feedback: true,
      sourceRegistry: true,
      dedupeKeys: true,
      latestRawEvidence: true,
      pendingStaging: true,
    },
  };
}

export async function previewRetentionLifecycle(
  now = new Date(),
): Promise<RetentionPreview> {
  return previewWithExecutor(rfpDb, now, retentionPolicy());
}

export async function applyRetentionLifecycle(
  now = new Date(),
): Promise<RetentionApplyResult> {
  const policy = retentionPolicy();
  const stagingBefore = daysBefore(now, policy.stagingDays);
  const rawBefore = daysBefore(now, policy.rawDays);
  const runBefore = daysBefore(now, policy.runDays);

  return rfpDb.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('insight-hub-retention-lifecycle', 0))`,
    );

    const preview = await previewWithExecutor(tx, now, policy);

    const archived = await tx.execute(sql`
      UPDATE opportunities
      SET status = 'archived', updated_at = ${now}
      WHERE status = 'active'
        AND response_deadline IS NOT NULL
        AND response_deadline < ${now}
      RETURNING id
    `);

    const staging = await tx.execute(sql`
      DELETE FROM opportunity_staging
      WHERE quality_status <> 'pending'
        AND updated_at < ${stagingBefore}
      RETURNING id
    `);

    const raw = await tx.execute(sql`
      DELETE FROM opportunity_raw_records raw
      WHERE raw.collected_at < ${rawBefore}
        AND NOT EXISTS (
          SELECT 1 FROM opportunity_staging staging
          WHERE staging.raw_record_id = raw.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM opportunity_source_registry registry
          WHERE registry.latest_raw_record_id = raw.id
        )
      RETURNING id
    `);

    const runs = await tx.execute(sql`
      DELETE FROM opportunity_ingestion_runs run
      WHERE run.status IN (${terminalStatusSql()})
        AND coalesce(run.completed_at, run.updated_at) < ${runBefore}
        AND NOT EXISTS (
          SELECT 1 FROM opportunity_raw_records raw
          WHERE raw.run_id = run.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM opportunity_staging staging
          WHERE staging.run_id = run.id
        )
      RETURNING id
    `);

    const result: RetentionApplyResult = {
      ...preview,
      appliedAt: now.toISOString(),
      applied: {
        opportunitiesArchived: affectedRows(archived),
        stagingRowsPruned: affectedRows(staging),
        rawRowsPruned: affectedRows(raw),
        ingestionRunsPruned: affectedRows(runs),
      },
    };

    if (
      result.applied.opportunitiesArchived > preview.candidates.opportunitiesToArchive ||
      result.applied.stagingRowsPruned > preview.candidates.stagingRowsToPrune ||
      result.applied.rawRowsPruned > preview.candidates.rawRowsToPrune ||
      result.applied.ingestionRunsPruned > preview.candidates.ingestionRunsToPrune
    ) {
      throw new Error(
        "Retention apply exceeded its transaction-scoped preview; transaction aborted.",
      );
    }

    return result;
  });
}
