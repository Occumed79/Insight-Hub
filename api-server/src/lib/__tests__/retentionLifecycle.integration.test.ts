import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??=
  "postgresql://test:test@127.0.0.1:5432/rfp_core";
process.env.INTEL_DATABASE_URL ??= process.env.RFP_DATABASE_URL;
process.env.AUTH_DATABASE_URL ??= process.env.RFP_DATABASE_URL;
process.env.APP_DATABASE_URL ??= process.env.RFP_DATABASE_URL;
process.env.INSIGHT_RETENTION_STAGING_DAYS = "30";
process.env.INSIGHT_RETENTION_RAW_DAYS = "90";
process.env.INSIGHT_RETENTION_RUN_DAYS = "180";

const { rfpPool } = await import("@workspace/db");
const {
  applyRetentionLifecycle,
  previewRetentionLifecycle,
  retentionPolicy,
} = await import("../retentionLifecycle");

const NOW = new Date("2026-08-07T00:00:00.000Z");
const OLD = "2025-01-01T00:00:00.000Z";
const FUTURE = "2026-12-31T00:00:00.000Z";

async function scalar(query: string, params: unknown[] = []): Promise<number> {
  const result = await rfpPool.query<{ count: number }>(query, params);
  return Number(result.rows[0]?.count ?? 0);
}

async function seed(): Promise<void> {
  await rfpPool.query(`
    TRUNCATE TABLE
      opportunity_dedupe_keys,
      opportunity_source_registry,
      opportunity_staging,
      opportunity_raw_records,
      opportunity_ingestion_run_sources,
      opportunity_ingestion_runs,
      opportunity_feedback,
      opportunities
    CASCADE
  `);

  await rfpPool.query(
    `INSERT INTO opportunities (
      id, notice_id, title, agency, type, status, posted_date,
      response_deadline, description, source, provider_name, provider_key,
      created_at, updated_at
    ) VALUES
      ($1, 'RET-ARCHIVE', 'Expired occupational health solicitation', 'Test Agency', 'Solicitation', 'active', $3, $3, 'Expired fixture', 'manual', 'manual', 'manual', $3, $3),
      ($2, 'RET-CURRENT', 'Current occupational health solicitation', 'Test Agency', 'Solicitation', 'active', $3, $4, 'Current fixture', 'manual', 'manual', 'manual', $3, $3)`,
    [
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000102",
      OLD,
      FUTURE,
    ],
  );

  await rfpPool.query(
    `INSERT INTO opportunity_feedback (
      id, opportunity_id, grade, agency, provider_name, title, description, created_at, updated_at
    ) VALUES ($1, $2, 'excellent', 'Test Agency', 'manual', 'Expired fixture', 'Must survive retention', $3, $3)`,
    [
      "ret-feedback-001",
      "00000000-0000-4000-8000-000000000101",
      OLD,
    ],
  );

  for (const run of ["run-prune", "run-latest", "run-pending"]) {
    await rfpPool.query(
      `INSERT INTO opportunity_ingestion_runs (
        id, status, selected_providers, providers_total, completed_at, created_at, updated_at
      ) VALUES ($1, 'completed', '["manual"]'::jsonb, 1, $2, $2, $2)`,
      [run, OLD],
    );
    await rfpPool.query(
      `INSERT INTO opportunity_ingestion_run_sources (
        id, run_id, provider, position, status, completed_at, updated_at
      ) VALUES ($1, $2, 'manual', 0, 'completed', $3, $3)`,
      [`source-${run}`, run, OLD],
    );
  }

  for (const [run, rawId] of [
    ["run-prune", "raw-prune"],
    ["run-latest", "raw-latest"],
    ["run-pending", "raw-pending"],
  ]) {
    await rfpPool.query(
      `INSERT INTO opportunity_raw_records (
        id, run_id, run_source_id, provider, provider_native_id,
        provider_record, collected_at
      ) VALUES ($1, $2, $3, 'manual', $1, '{}'::jsonb, $4)`,
      [rawId, run, `source-${run}`, OLD],
    );
  }

  await rfpPool.query(
    `INSERT INTO opportunity_staging (
      id, run_id, raw_record_id, provider, provider_native_id,
      normalized_record, quality_status, completeness_score, source_confidence,
      dedupe_keys, created_at, updated_at
    ) VALUES
      ('staging-prune', 'run-prune', 'raw-prune', 'manual', 'raw-prune', '{}'::jsonb, 'accepted', 100, 100, '[]'::jsonb, $1, $1),
      ('staging-latest', 'run-latest', 'raw-latest', 'manual', 'raw-latest', '{}'::jsonb, 'accepted', 100, 100, '[]'::jsonb, $1, $1),
      ('staging-pending', 'run-pending', 'raw-pending', 'manual', 'raw-pending', '{}'::jsonb, 'pending', 100, 100, '[]'::jsonb, $1, $1)`,
    [OLD],
  );

  await rfpPool.query(
    `INSERT INTO opportunity_source_registry (
      id, opportunity_id, provider, provider_native_id, latest_raw_record_id,
      first_seen_at, last_seen_at
    ) VALUES (
      'registry-latest', $1, 'manual', 'latest-evidence', 'raw-latest', $2, $2
    )`,
    ["00000000-0000-4000-8000-000000000102", OLD],
  );

  await rfpPool.query(
    `INSERT INTO opportunity_dedupe_keys (
      id, opportunity_id, key_type, dedupe_key, first_seen_at, last_seen_at
    ) VALUES
      ('dedupe-archive', $1, 'provider', 'retention:archive', $3, $3),
      ('dedupe-current', $2, 'provider', 'retention:current', $3, $3)`,
    [
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000102",
      OLD,
    ],
  );
}

test("retention policy is conservative and preview exactly matches sequential apply", async () => {
  await seed();
  assert.deepEqual(retentionPolicy(), {
    stagingDays: 30,
    rawDays: 90,
    runDays: 180,
  });

  const preview = await previewRetentionLifecycle(NOW);
  assert.deepEqual(preview.candidates, {
    opportunitiesToArchive: 1,
    stagingRowsToPrune: 2,
    rawRowsToPrune: 1,
    ingestionRunsToPrune: 1,
  });
  assert.equal(preview.preserved.canonicalOpportunities, true);
  assert.equal(preview.preserved.feedback, true);
  assert.equal(preview.preserved.latestRawEvidence, true);
  assert.equal(preview.preserved.pendingStaging, true);

  const applied = await applyRetentionLifecycle(NOW);
  assert.deepEqual(applied.applied, {
    opportunitiesArchived: 1,
    stagingRowsPruned: 2,
    rawRowsPruned: 1,
    ingestionRunsPruned: 1,
  });
  assert.deepEqual(applied.applied, {
    opportunitiesArchived: preview.candidates.opportunitiesToArchive,
    stagingRowsPruned: preview.candidates.stagingRowsToPrune,
    rawRowsPruned: preview.candidates.rawRowsToPrune,
    ingestionRunsPruned: preview.candidates.ingestionRunsToPrune,
  });

  const archived = await rfpPool.query<{ status: string }>(
    "SELECT status FROM opportunities WHERE notice_id = 'RET-ARCHIVE'",
  );
  assert.equal(archived.rows[0]?.status, "archived");
  assert.equal(await scalar("SELECT count(*)::int AS count FROM opportunities"), 2);
  assert.equal(await scalar("SELECT count(*)::int AS count FROM opportunity_feedback"), 1);
  assert.equal(await scalar("SELECT count(*)::int AS count FROM opportunity_source_registry"), 1);
  assert.equal(await scalar("SELECT count(*)::int AS count FROM opportunity_dedupe_keys"), 2);

  assert.equal(
    await scalar("SELECT count(*)::int AS count FROM opportunity_raw_records WHERE id = 'raw-prune'"),
    0,
  );
  assert.equal(
    await scalar("SELECT count(*)::int AS count FROM opportunity_raw_records WHERE id = 'raw-latest'"),
    1,
  );
  assert.equal(
    await scalar("SELECT count(*)::int AS count FROM opportunity_raw_records WHERE id = 'raw-pending'"),
    1,
  );
  assert.equal(
    await scalar("SELECT count(*)::int AS count FROM opportunity_staging WHERE id = 'staging-pending'"),
    1,
  );
  assert.equal(
    await scalar("SELECT count(*)::int AS count FROM opportunity_ingestion_runs WHERE id = 'run-prune'"),
    0,
  );
  assert.equal(
    await scalar("SELECT count(*)::int AS count FROM opportunity_ingestion_runs WHERE id = 'run-latest'"),
    1,
  );
  assert.equal(
    await scalar("SELECT count(*)::int AS count FROM opportunity_ingestion_runs WHERE id = 'run-pending'"),
    1,
  );
});

test.after(async () => {
  await rfpPool.end();
});
