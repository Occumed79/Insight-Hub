import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.RFP_DATABASE_URL;
if (!databaseUrl) throw new Error("RFP_DATABASE_URL is required");

const REQUIRED_TABLES = [
  "opportunities",
  "opportunity_feedback",
  "settings",
  "opportunity_ingestion_runs",
  "opportunity_ingestion_run_sources",
  "opportunity_raw_records",
  "opportunity_staging",
  "opportunity_source_registry",
  "opportunity_dedupe_keys",
];

const REQUIRED_COLUMNS = {
  opportunities: [
    "id",
    "notice_id",
    "title",
    "agency",
    "type",
    "status",
    "description",
    "source",
    "provider_name",
    "provider_key",
    "relevance_score",
    "user_confidence",
    "user_grade",
    "first_seen_at",
    "last_seen_at",
    "created_at",
    "updated_at",
  ],
  opportunity_feedback: [
    "id",
    "opportunity_id",
    "grade",
    "agency",
    "naics_code",
    "provider_name",
    "tags",
    "title",
    "description",
    "created_at",
    "updated_at",
  ],
  opportunity_ingestion_runs: [
    "id",
    "status",
    "providers_requested",
    "providers_completed",
    "providers_failed",
    "providers_timed_out",
    "providers_skipped",
    "heartbeat_at",
    "cancellation_requested_at",
    "status_message",
    "created_at",
    "updated_at",
  ],
  opportunity_ingestion_run_sources: [
    "id",
    "run_id",
    "provider_key",
    "status",
    "elapsed_ms",
    "created_at",
    "updated_at",
  ],
};

const REQUIRED_INDEXES = [
  ["opportunities", "uq_opportunities_provider_notice"],
  ["opportunity_feedback", "idx_opportunity_feedback_opportunity_id"],
];

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const failures = [];

  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const tableSet = new Set(tables.rows.map((row) => row.table_name));
  for (const table of REQUIRED_TABLES) {
    if (!tableSet.has(table)) failures.push(`missing table public.${table}`);
  }

  const columns = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const columnsByTable = new Map();
  for (const row of columns.rows) {
    const set = columnsByTable.get(row.table_name) ?? new Set();
    set.add(row.column_name);
    columnsByTable.set(row.table_name, set);
  }
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    const actual = columnsByTable.get(table) ?? new Set();
    for (const column of required) {
      if (!actual.has(column)) failures.push(`missing column public.${table}.${column}`);
    }
  }

  const indexes = await client.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
  `);
  const indexMap = new Map(
    indexes.rows.map((row) => [`${row.tablename}:${row.indexname}`, row.indexdef]),
  );
  for (const [table, index] of REQUIRED_INDEXES) {
    if (!indexMap.has(`${table}:${index}`)) {
      failures.push(`missing index ${index} on public.${table}`);
    }
  }
  const providerIdentityIndex = indexMap.get(
    "opportunities:uq_opportunities_provider_notice",
  );
  if (
    providerIdentityIndex &&
    (!/UNIQUE/i.test(providerIdentityIndex) ||
      !/provider_key/i.test(providerIdentityIndex) ||
      !/notice_id/i.test(providerIdentityIndex))
  ) {
    failures.push(
      "uq_opportunities_provider_notice no longer enforces provider_key + notice_id uniqueness",
    );
  }

  const constraints = await client.query(`
    SELECT
      conname,
      contype,
      convalidated,
      conrelid::regclass::text AS table_name,
      pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
  `);
  const feedbackFk = constraints.rows.find(
    (row) =>
      row.table_name === "opportunity_feedback" &&
      row.contype === "f" &&
      /opportunity_id/i.test(row.definition) &&
      /REFERENCES opportunities/i.test(row.definition),
  );
  if (!feedbackFk) {
    failures.push("missing opportunity_feedback -> opportunities foreign key");
  } else if (!feedbackFk.convalidated) {
    failures.push("opportunity_feedback foreign key is present but not validated");
  }

  const enumRows = await client.query(`
    SELECT t.typname, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname IN (
      'opportunity_ingestion_run_status',
      'opportunity_ingestion_source_status'
    )
  `);
  const enumValues = new Map();
  for (const row of enumRows.rows) {
    const set = enumValues.get(row.typname) ?? new Set();
    set.add(row.enumlabel);
    enumValues.set(row.typname, set);
  }
  if (!enumValues.get("opportunity_ingestion_run_status")?.has("cancelled")) {
    failures.push("opportunity_ingestion_run_status is missing cancelled");
  }
  for (const value of ["timed_out", "cancelled"]) {
    if (!enumValues.get("opportunity_ingestion_source_status")?.has(value)) {
      failures.push(`opportunity_ingestion_source_status is missing ${value}`);
    }
  }

  const report = {
    event: "critical_rfp_schema_audit",
    ok: failures.length === 0,
    database: new URL(databaseUrl).pathname.replace(/^\//, ""),
    requiredTables: REQUIRED_TABLES.length,
    requiredIndexes: REQUIRED_INDEXES.length,
    failures,
  };
  console.log(JSON.stringify(report));
  if (failures.length) process.exitCode = 1;
} finally {
  await client.end();
}
