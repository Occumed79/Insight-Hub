import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { rfpDb } from "@workspace/db";
import {
  opportunitiesTable,
  opportunityDedupeKeysTable,
  opportunityIngestionRunsTable,
  opportunityIngestionRunSourcesTable,
  opportunityRawRecordsTable,
  opportunitySourceRegistryTable,
  opportunityStagingTable,
  type OpportunityIngestionRun,
} from "@workspace/db/schema/rfp";
import type { NormalizedOpportunity } from "../providers/types";
import { normalizedToDbRecord } from "../search/normalization";
import {
  evidenceStrengthFromStored,
  normalizeOpportunityEvidence,
} from "../opportunityEvidence";
import {
  calculateOpportunityDedupeKeys,
  canonicalizeOpportunityUrl,
  decideOpportunityQuality,
  generatedProviderNativeId,
  providerKeyForOpportunity,
  serializeOpportunity,
  type OpportunityDedupeKey,
} from "./opportunityIdentity";
import {
  fetchOneProvider,
  resolveManualProviders,
  type ProviderRunResult,
} from "./providerRunner";
import {
  classifyIdentityMatch,
  failedProvidersForRetry,
  protectedLineageKeys,
  shouldProtectCanonicalFromRefresh,
  STALE_INGESTION_RUN_AFTER_MS,
} from "./pipelineRules";

const ACTIVE_RUN_STATUSES = ["queued", "running"] as const;
const RETRYABLE_RUN_STATUSES = new Set([
  "completed",
  "completed_with_errors",
  "failed",
]);
const STALE_RUN_RECOVERY_ERROR =
  "Run was marked failed during a later manual start because it had no persisted progress for 30 minutes.";

export class ActiveIngestionRunError extends Error {
  constructor(public readonly runId: string) {
    super(`An ingestion run is already active: ${runId}`);
  }
}

export class IngestionRunNotRetryableError extends Error {}

export interface StartIngestionRequest {
  keywords?: string;
  dateRange?: number;
  providers?: string[];
  retryOfRunId?: string;
}

export interface ProcessingCounts {
  staged: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  created: number;
  updated: number;
}

export interface IngestionRunView extends OpportunityIngestionRun {
  sources: Array<typeof opportunityIngestionRunSourcesTable.$inferSelect>;
  providerErrors: Array<{ provider: string; error: string }>;
}

export type ProviderFetcher = (
  provider: string,
  options: { keywords?: string; dateRange?: number },
) => Promise<ProviderRunResult>;

function conciseError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return (
    message.replace(/\s+/g, " ").trim().slice(0, 500) ||
    "Unknown provider error"
  );
}

function evidenceFromRecord(
  record: NormalizedOpportunity,
): Record<string, unknown> | null {
  const raw = record.rawData ?? {};
  const evidenceEntries = Object.entries(raw).filter(([key]) =>
    /evidence|document|portal|source|url|extracted|tenant|platform|response/i.test(
      key,
    ),
  );
  return evidenceEntries.length > 0
    ? Object.fromEntries(evidenceEntries)
    : null;
}

function toStagingJson(record: NormalizedOpportunity): Record<string, unknown> {
  return serializeOpportunity(record);
}

async function getRunRow(runId: string) {
  const [run] = await rfpDb
    .select()
    .from(opportunityIngestionRunsTable)
    .where(eq(opportunityIngestionRunsTable.id, runId))
    .limit(1);
  return run ?? null;
}

export async function getIngestionRun(
  runId: string,
): Promise<IngestionRunView | null> {
  const run = await getRunRow(runId);
  if (!run) return null;
  const sources = await rfpDb
    .select()
    .from(opportunityIngestionRunSourcesTable)
    .where(eq(opportunityIngestionRunSourcesTable.runId, runId))
    .orderBy(opportunityIngestionRunSourcesTable.position);
  return {
    ...run,
    sources,
    providerErrors: sources
      .filter((source) => source.error)
      .map((source) => ({ provider: source.provider, error: source.error! })),
  };
}

export async function getCurrentIngestionRun(): Promise<IngestionRunView | null> {
  const [run] = await rfpDb
    .select()
    .from(opportunityIngestionRunsTable)
    .orderBy(desc(opportunityIngestionRunsTable.createdAt))
    .limit(1);
  return run ? getIngestionRun(run.id) : null;
}

export async function listRecentIngestionRuns(
  limit = 20,
): Promise<IngestionRunView[]> {
  const runs = await rfpDb
    .select()
    .from(opportunityIngestionRunsTable)
    .orderBy(desc(opportunityIngestionRunsTable.createdAt))
    .limit(Math.min(50, Math.max(1, limit)));
  return Promise.all(
    runs.map((run) => getIngestionRun(run.id) as Promise<IngestionRunView>),
  );
}

async function createPersistedRun(
  request: StartIngestionRequest,
): Promise<IngestionRunView> {
  const providers = resolveManualProviders(request.providers);
  const runId = randomUUID();
  const now = new Date();

  await rfpDb.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('manual-rfp-ingestion-active-run', 0))`,
    );
    const staleBefore = new Date(now.getTime() - STALE_INGESTION_RUN_AFTER_MS);
    const staleRuns = await tx
      .update(opportunityIngestionRunsTable)
      .set({
        status: "failed",
        currentProvider: null,
        errors: sql`coalesce(${opportunityIngestionRunsTable.errors}, '[]'::jsonb) || ${JSON.stringify([STALE_RUN_RECOVERY_ERROR])}::jsonb`,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          inArray(opportunityIngestionRunsTable.status, [
            ...ACTIVE_RUN_STATUSES,
          ]),
          lte(opportunityIngestionRunsTable.updatedAt, staleBefore),
        ),
      )
      .returning({ id: opportunityIngestionRunsTable.id });

    if (staleRuns.length > 0) {
      await tx
        .update(opportunityIngestionRunSourcesTable)
        .set({
          status: "failed",
          error: STALE_RUN_RECOVERY_ERROR,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            inArray(
              opportunityIngestionRunSourcesTable.runId,
              staleRuns.map((run) => run.id),
            ),
            inArray(opportunityIngestionRunSourcesTable.status, [
              ...ACTIVE_RUN_STATUSES,
            ]),
          ),
        );
    }

    const [active] = await tx
      .select({ id: opportunityIngestionRunsTable.id })
      .from(opportunityIngestionRunsTable)
      .where(
        inArray(opportunityIngestionRunsTable.status, [...ACTIVE_RUN_STATUSES]),
      )
      .limit(1);
    if (active) throw new ActiveIngestionRunError(active.id);

    await tx.insert(opportunityIngestionRunsTable).values({
      id: runId,
      status: "queued",
      selectedProviders: providers,
      query: request.keywords?.trim() || null,
      dateRange: request.dateRange ?? null,
      retryOfRunId: request.retryOfRunId ?? null,
      providersTotal: providers.length,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(opportunityIngestionRunSourcesTable).values(
      providers.map((provider, position) => ({
        id: randomUUID(),
        runId,
        provider,
        position,
        status: "queued" as const,
        updatedAt: now,
      })),
    );
  });

  return (await getIngestionRun(runId))!;
}

async function findExistingOpportunity(
  tx: any,
  record: NormalizedOpportunity,
  keys: OpportunityDedupeKey[],
): Promise<{
  opportunityId: string;
  matchType: OpportunityDedupeKey["type"];
} | null> {
  if (keys.length > 0) {
    const rows = await tx
      .select({
        opportunityId: opportunityDedupeKeysTable.opportunityId,
        dedupeKey: opportunityDedupeKeysTable.dedupeKey,
      })
      .from(opportunityDedupeKeysTable)
      .where(
        inArray(
          opportunityDedupeKeysTable.dedupeKey,
          keys.map((key) => key.value),
        ),
      );
    const match = classifyIdentityMatch(
      keys,
      new Map(
        rows.map((row: { dedupeKey: string; opportunityId: string }) => [
          row.dedupeKey,
          row.opportunityId,
        ]),
      ),
    );
    if (match) return match;
  }

  const providerKey = providerKeyForOpportunity(record);
  const providerNativeId = generatedProviderNativeId(record);
  const [providerMatch] = await tx
    .select({ id: opportunitiesTable.id })
    .from(opportunitiesTable)
    .where(
      and(
        eq(opportunitiesTable.providerKey, providerKey),
        eq(opportunitiesTable.noticeId, providerNativeId),
      ),
    )
    .limit(1);
  if (providerMatch)
    return { opportunityId: providerMatch.id, matchType: "provider" };

  if (record.solicitationNumber?.trim() && record.agency?.trim()) {
    const [solicitationMatch] = await tx
      .select({ id: opportunitiesTable.id })
      .from(opportunitiesTable)
      .where(
        and(
          sql`lower(regexp_replace(coalesce(${opportunitiesTable.solicitationNumber}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${record.solicitationNumber.replace(/[^a-z0-9]/gi, "").toLowerCase()}`,
          sql`lower(regexp_replace(${opportunitiesTable.agency}, '[^a-zA-Z0-9]+', ' ', 'g')) = ${record.agency
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim()}`,
        ),
      )
      .limit(1);
    if (solicitationMatch)
      return { opportunityId: solicitationMatch.id, matchType: "solicitation" };
  }

  const canonicalUrl = canonicalizeOpportunityUrl(record.sourceUrl);
  if (canonicalUrl) {
    const [urlMatch] = await tx
      .select({ id: opportunitiesTable.id })
      .from(opportunitiesTable)
      .where(eq(opportunitiesTable.samUrl, canonicalUrl))
      .limit(1);
    if (urlMatch) return { opportunityId: urlMatch.id, matchType: "url" };
  }
  return null;
}

async function registerLineage(
  tx: any,
  opportunityId: string,
  provider: string,
  providerNativeId: string,
  sourceUrl: string | undefined,
  rawRecordId: string,
  keys: OpportunityDedupeKey[],
  now: Date,
) {
  const [existingSource] = await tx
    .select({ id: opportunitySourceRegistryTable.id })
    .from(opportunitySourceRegistryTable)
    .where(
      and(
        eq(opportunitySourceRegistryTable.provider, provider),
        eq(opportunitySourceRegistryTable.providerNativeId, providerNativeId),
      ),
    )
    .limit(1);
  if (existingSource) {
    await tx
      .update(opportunitySourceRegistryTable)
      .set({
        opportunityId,
        sourceUrl: sourceUrl ?? null,
        canonicalUrl: canonicalizeOpportunityUrl(sourceUrl),
        latestRawRecordId: rawRecordId,
        lastSeenAt: now,
      })
      .where(eq(opportunitySourceRegistryTable.id, existingSource.id));
  } else {
    await tx.insert(opportunitySourceRegistryTable).values({
      id: randomUUID(),
      opportunityId,
      provider,
      providerNativeId,
      sourceUrl: sourceUrl ?? null,
      canonicalUrl: canonicalizeOpportunityUrl(sourceUrl),
      latestRawRecordId: rawRecordId,
      firstSeenAt: now,
      lastSeenAt: now,
    });
  }

  for (const key of keys) {
    await tx
      .insert(opportunityDedupeKeysTable)
      .values({
        id: randomUUID(),
        opportunityId,
        keyType: key.type,
        dedupeKey: key.value,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: opportunityDedupeKeysTable.dedupeKey,
        set: { lastSeenAt: now },
      });
  }
}

async function processOneRecord(
  runId: string,
  runSourceId: string,
  provider: string,
  record: NormalizedOpportunity,
): Promise<Omit<ProcessingCounts, "staged"> & { staged: 1 }> {
  const now = new Date();
  const rawRecordId = randomUUID();
  const stagingId = randomUUID();
  const providerNativeId = generatedProviderNativeId(record);
  const keys = calculateOpportunityDedupeKeys({
    ...record,
    externalId: providerNativeId,
  });
  const quality = decideOpportunityQuality(record);

  return rfpDb.transaction(async (tx) => {
    await tx.insert(opportunityRawRecordsTable).values({
      id: rawRecordId,
      runId,
      runSourceId,
      provider,
      providerNativeId,
      sourceUrl: record.sourceUrl ?? null,
      providerRecord: serializeOpportunity(record),
      sourceEvidence: evidenceFromRecord(record),
      collectedAt: now,
    });
    await tx.insert(opportunityStagingTable).values({
      id: stagingId,
      runId,
      rawRecordId,
      provider,
      providerNativeId,
      title: record.title ?? null,
      agency: record.agency ?? null,
      solicitationNumber: record.solicitationNumber ?? null,
      sourceUrl: record.sourceUrl ?? null,
      postedDate: record.postedDate ?? null,
      responseDeadline: record.responseDeadline ?? null,
      normalizedRecord: toStagingJson(record),
      qualityStatus: "pending",
      completenessScore: String(quality.completenessScore),
      sourceConfidence: String(quality.sourceConfidence),
      dedupeKeys: keys.map((key) => key.value),
      createdAt: now,
      updatedAt: now,
    });

    if (quality.status !== "accepted") {
      await tx
        .update(opportunityStagingTable)
        .set({
          qualityStatus: quality.status,
          qualityReason: quality.reason,
          updatedAt: now,
        })
        .where(eq(opportunityStagingTable.id, stagingId));
      return {
        staged: 1,
        accepted: 0,
        rejected: 1,
        duplicates: 0,
        created: 0,
        updated: 0,
      };
    }

    const lockKey = keys[0]?.value ?? `${provider}:${providerNativeId}`;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
    const existing = await findExistingOpportunity(
      tx,
      { ...record, externalId: providerNativeId },
      keys,
    );
    let existingCanonical: typeof opportunitiesTable.$inferSelect | undefined;
    if (existing) {
      [existingCanonical] = await tx
        .select()
        .from(opportunitiesTable)
        .where(eq(opportunitiesTable.id, existing.opportunityId))
        .limit(1);
    }
    const incomingEvidence = normalizeOpportunityEvidence(record);
    const existingStrength = existingCanonical
      ? evidenceStrengthFromStored(existingCanonical)
      : 0;
    const incomingWeakensCanonical = Boolean(
      existingCanonical && incomingEvidence.strength < existingStrength,
    );
    const protectedDuplicate =
      existing &&
      (incomingWeakensCanonical ||
        shouldProtectCanonicalFromRefresh(
          existing.matchType,
          record.rawData?.fallback === true ||
            incomingEvidence.evidenceType === "discovery" ||
            incomingEvidence.evidenceType === "aggregator" ||
            incomingEvidence.evidenceType === "landing-page",
        ));
    let opportunityId = existing?.opportunityId ?? randomUUID();
    let created = 0;
    let updated = 0;

    if (protectedDuplicate) {
      await registerLineage(
        tx,
        opportunityId,
        provider,
        providerNativeId,
        record.sourceUrl,
        rawRecordId,
        protectedLineageKeys(keys, existing.matchType),
        now,
      );
      await tx
        .update(opportunityStagingTable)
        .set({
          qualityStatus: "duplicate",
          qualityReason: incomingWeakensCanonical
            ? `Weaker ${incomingEvidence.evidenceType} record resolved to stronger canonical opportunity by ${existing.matchType} identity without refreshing canonical fields.`
            : record.rawData?.fallback === true
              ? `Fallback record resolved to canonical opportunity by ${existing.matchType} identity without refreshing canonical fields.`
              : `Resolved to canonical opportunity by ${existing.matchType} identity.`,
          canonicalOpportunityId: opportunityId,
          updatedAt: now,
        })
        .where(eq(opportunityStagingTable.id, stagingId));
      return {
        staged: 1,
        accepted: 0,
        rejected: 0,
        duplicates: 1,
        created: 0,
        updated: 0,
      };
    }

    const normalized = normalizedToDbRecord({
      ...record,
      externalId: providerNativeId,
    });
    if (existing) {
      const {
        userGrade: _userGrade,
        userConfidence: _userConfidence,
        notes: _notes,
        ...sourceFields
      } = normalized as typeof normalized & {
        userGrade?: unknown;
        userConfidence?: unknown;
        notes?: unknown;
      };
      await tx
        .update(opportunitiesTable)
        .set({
          ...sourceFields,
          noticeId: providerNativeId,
          providerKey: providerKeyForOpportunity(record),
          samUrl:
            canonicalizeOpportunityUrl(record.sourceUrl) ?? sourceFields.samUrl,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(opportunitiesTable.id, opportunityId));
      updated = 1;
    } else {
      await tx.insert(opportunitiesTable).values({
        ...normalized,
        id: opportunityId,
        noticeId: providerNativeId,
        providerKey: providerKeyForOpportunity(record),
        samUrl:
          canonicalizeOpportunityUrl(record.sourceUrl) ?? normalized.samUrl,
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
      created = 1;
    }

    await registerLineage(
      tx,
      opportunityId,
      provider,
      providerNativeId,
      record.sourceUrl,
      rawRecordId,
      keys,
      now,
    );
    await tx
      .update(opportunityStagingTable)
      .set({
        qualityStatus: "accepted",
        qualityReason: existing
          ? `Canonical opportunity refreshed by ${existing.matchType} identity.`
          : null,
        canonicalOpportunityId: opportunityId,
        updatedAt: now,
      })
      .where(eq(opportunityStagingTable.id, stagingId));
    return {
      staged: 1,
      accepted: 1,
      rejected: 0,
      duplicates: 0,
      created,
      updated,
    };
  });
}

async function incrementProgress(
  runId: string,
  runSourceId: string,
  counts: ProcessingCounts,
) {
  const now = new Date();
  await rfpDb.transaction(async (tx) => {
    await tx
      .update(opportunityIngestionRunSourcesTable)
      .set({
        staged: sql`${opportunityIngestionRunSourcesTable.staged} + ${counts.staged}`,
        accepted: sql`${opportunityIngestionRunSourcesTable.accepted} + ${counts.accepted}`,
        rejected: sql`${opportunityIngestionRunSourcesTable.rejected} + ${counts.rejected}`,
        duplicates: sql`${opportunityIngestionRunSourcesTable.duplicates} + ${counts.duplicates}`,
        created: sql`${opportunityIngestionRunSourcesTable.created} + ${counts.created}`,
        updated: sql`${opportunityIngestionRunSourcesTable.updated} + ${counts.updated}`,
        updatedAt: now,
      })
      .where(eq(opportunityIngestionRunSourcesTable.id, runSourceId));
    await tx
      .update(opportunityIngestionRunsTable)
      .set({
        staged: sql`${opportunityIngestionRunsTable.staged} + ${counts.staged}`,
        accepted: sql`${opportunityIngestionRunsTable.accepted} + ${counts.accepted}`,
        rejected: sql`${opportunityIngestionRunsTable.rejected} + ${counts.rejected}`,
        duplicates: sql`${opportunityIngestionRunsTable.duplicates} + ${counts.duplicates}`,
        created: sql`${opportunityIngestionRunsTable.created} + ${counts.created}`,
        updated: sql`${opportunityIngestionRunsTable.updated} + ${counts.updated}`,
        updatedAt: now,
      })
      .where(eq(opportunityIngestionRunsTable.id, runId));
  });
}

export async function reconcileExpiredOpportunities(
  now = new Date(),
): Promise<number> {
  const archived = await rfpDb
    .update(opportunitiesTable)
    .set({ status: "archived", updatedAt: now })
    .where(
      and(
        eq(opportunitiesTable.status, "active"),
        lt(opportunitiesTable.responseDeadline, now),
      ),
    )
    .returning({ id: opportunitiesTable.id });
  return archived.length;
}

async function executePersistedRun(
  runId: string,
  providerFetcher: ProviderFetcher,
): Promise<void> {
  const run = await getIngestionRun(runId);
  if (!run) throw new Error(`Ingestion run not found: ${runId}`);
  const now = new Date();
  await rfpDb
    .update(opportunityIngestionRunsTable)
    .set({ status: "running", startedAt: now, updatedAt: now })
    .where(eq(opportunityIngestionRunsTable.id, runId));

  const runErrors: string[] = [];
  for (const source of run.sources) {
    const startedAt = new Date();
    await rfpDb.transaction(async (tx) => {
      await tx
        .update(opportunityIngestionRunSourcesTable)
        .set({ status: "running", startedAt, updatedAt: startedAt })
        .where(eq(opportunityIngestionRunSourcesTable.id, source.id));
      await tx
        .update(opportunityIngestionRunsTable)
        .set({ currentProvider: source.provider, updatedAt: startedAt })
        .where(eq(opportunityIngestionRunsTable.id, runId));
    });

    let sourceError: string | null = null;
    try {
      const result = await providerFetcher(source.provider, {
        keywords: run.query ?? undefined,
        dateRange: run.dateRange ?? undefined,
      });
      await rfpDb.transaction(async (tx) => {
        await tx
          .update(opportunityIngestionRunSourcesTable)
          .set({ fetched: result.records.length, updatedAt: new Date() })
          .where(eq(opportunityIngestionRunSourcesTable.id, source.id));
        await tx
          .update(opportunityIngestionRunsTable)
          .set({
            fetched: sql`${opportunityIngestionRunsTable.fetched} + ${result.records.length}`,
            updatedAt: new Date(),
          })
          .where(eq(opportunityIngestionRunsTable.id, runId));
      });

      for (const record of result.records) {
        const counts = await processOneRecord(
          runId,
          source.id,
          source.provider,
          record,
        );
        await incrementProgress(runId, source.id, counts);
      }
      if (result.errors.length > 0)
        sourceError = result.errors.map(conciseError).join(" | ").slice(0, 500);
    } catch (error) {
      sourceError = conciseError(error);
    }

    const completedAt = new Date();
    if (sourceError) runErrors.push(`[${source.provider}] ${sourceError}`);
    await rfpDb.transaction(async (tx) => {
      await tx
        .update(opportunityIngestionRunSourcesTable)
        .set({
          status: sourceError ? "failed" : "completed",
          error: sourceError,
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(opportunityIngestionRunSourcesTable.id, source.id));
      await tx
        .update(opportunityIngestionRunsTable)
        .set({
          providersCompleted: sql`${opportunityIngestionRunsTable.providersCompleted} + 1`,
          errors: runErrors,
          updatedAt: completedAt,
        })
        .where(eq(opportunityIngestionRunsTable.id, runId));
    });
  }

  const archived = await reconcileExpiredOpportunities();
  const failedSources = run.sources.length === 0 ? 0 : runErrors.length;
  const finalStatus =
    failedSources === run.sources.length
      ? "failed"
      : failedSources > 0
        ? "completed_with_errors"
        : "completed";
  const completedAt = new Date();
  await rfpDb
    .update(opportunityIngestionRunsTable)
    .set({
      status: finalStatus,
      currentProvider: null,
      archived,
      errors: runErrors,
      completedAt,
      updatedAt: completedAt,
    })
    .where(eq(opportunityIngestionRunsTable.id, runId));
}

export async function startManualIngestion(
  request: StartIngestionRequest,
  providerFetcher: ProviderFetcher = fetchOneProvider,
): Promise<IngestionRunView> {
  const run = await createPersistedRun(request);
  queueMicrotask(() => {
    void executePersistedRun(run.id, providerFetcher).catch(async (error) => {
      const message = conciseError(error);
      const completedAt = new Date();
      await rfpDb
        .update(opportunityIngestionRunsTable)
        .set({
          status: "failed",
          currentProvider: null,
          errors: [message],
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(opportunityIngestionRunsTable.id, run.id));
    });
  });
  return run;
}

export async function retryFailedProviders(
  runId: string,
  providerFetcher: ProviderFetcher = fetchOneProvider,
): Promise<IngestionRunView> {
  const original = await getIngestionRun(runId);
  if (!original) throw new Error(`Ingestion run not found: ${runId}`);
  if (!RETRYABLE_RUN_STATUSES.has(original.status)) {
    throw new IngestionRunNotRetryableError(
      "Only completed runs can be retried.",
    );
  }
  const failedProviders = failedProvidersForRetry(original.sources);
  if (failedProviders.length === 0) {
    throw new IngestionRunNotRetryableError(
      "This run has no failed providers to retry.",
    );
  }
  return startManualIngestion(
    {
      keywords: original.query ?? undefined,
      dateRange: original.dateRange ?? undefined,
      providers: failedProviders,
      retryOfRunId: original.id,
    },
    providerFetcher,
  );
}
