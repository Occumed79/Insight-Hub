import { getDatabaseConfigSummary, intelPool, rfpPool } from "@workspace/db";

const RFP_TABLES = [
  "opportunities",
  "opportunity_feedback",
  "settings",
];

const INTEL_TABLES = [
  "branch_hiring_posts",
  "client_branches",
  "client_contacts",
  "clients",
  "competitors",
  "federal_intel_items",
  "intel_feed_items",
  "intel_feed_signals",
  "prospect_contacts",
  "prospect_jobs",
  "prospect_locations",
  "prospects",
  "source_monitor_items",
  "source_monitor_runs",
  "state_agency_items",
  "state_intel_items",
  "state_profiles",
];

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function describeConnection(label: string, pool: typeof rfpPool) {
  const result = await pool.query(
    "select current_database() as database_name, current_user as user_name, inet_server_addr()::text as server_addr",
  );
  console.log(`\n${label.toUpperCase()} DB`);
  console.table(result.rows);
}

async function tableCounts(label: string, pool: typeof rfpPool, tables: string[]) {
  const rows: Array<{ table: string; exists: boolean; row_count: string | null }> = [];

  for (const table of tables) {
    const existsResult = await pool.query("select to_regclass($1) as regclass", [`public.${table}`]);
    const exists = Boolean(existsResult.rows[0]?.regclass);
    let rowCount: string | null = null;

    if (exists) {
      const countResult = await pool.query(`select count(*)::text as row_count from public.${quoteIdent(table)}`);
      rowCount = countResult.rows[0]?.row_count ?? null;
    }

    rows.push({ table, exists, row_count: rowCount });
  }

  console.log(`\n${label.toUpperCase()} TABLE COUNTS`);
  console.table(rows);
}

async function main() {
  console.log("Logical database config source summary. Full connection strings are intentionally never printed.");
  console.dir(getDatabaseConfigSummary(), { depth: null });

  await describeConnection("rfp", rfpPool);
  await tableCounts("rfp", rfpPool, RFP_TABLES);

  await describeConnection("intel", intelPool);
  await tableCounts("intel", intelPool, INTEL_TABLES);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([rfpPool.end(), intelPool.end()]);
  });
