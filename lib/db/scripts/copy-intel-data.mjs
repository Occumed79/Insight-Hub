import pg from "pg";

const { Pool } = pg;

const INTEL_TABLES = [
  "state_profiles",
  "clients",
  "competitors",
  "prospects",
  "client_branches",
  "client_contacts",
  "prospect_locations",
  "prospect_jobs",
  "prospect_contacts",
  "branch_hiring_posts",
  "federal_intel_items",
  "intel_feed_items",
  "intel_feed_signals",
  "source_monitor_items",
  "source_monitor_runs",
  "state_agency_items",
  "state_intel_items",
];

const apply = process.argv.includes("--apply");
const truncate = process.argv.includes("--truncate-target");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function getColumns(pool, table) {
  const result = await pool.query(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position`,
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

async function getCount(pool, table) {
  const exists = await pool.query("select to_regclass($1) as regclass", [`public.${table}`]);
  if (!exists.rows[0]?.regclass) return null;
  const result = await pool.query(`select count(*)::int as count from public.${quoteIdent(table)}`);
  return Number(result.rows[0]?.count ?? 0);
}

async function copyTable(source, target, table) {
  const sourceColumns = await getColumns(source, table);
  const targetColumns = await getColumns(target, table);
  const columns = sourceColumns.filter((column) => targetColumns.includes(column));

  if (columns.length === 0) {
    throw new Error(`No shared columns found for ${table}`);
  }

  const sourceCount = await getCount(source, table);
  const targetCountBefore = await getCount(target, table);

  if (sourceCount === null) {
    console.log(`${table}: source table missing, skipped`);
    return { table, sourceCount: null, targetCountBefore, inserted: 0, skipped: true };
  }
  if (targetCountBefore === null) {
    console.log(`${table}: target table missing, skipped`);
    return { table, sourceCount, targetCountBefore: null, inserted: 0, skipped: true };
  }

  if (!apply) {
    console.log(`${table}: dry-run source=${sourceCount} target=${targetCountBefore}`);
    return { table, sourceCount, targetCountBefore, inserted: 0, skipped: false };
  }

  if (truncate && targetCountBefore > 0) {
    await target.query(`truncate table public.${quoteIdent(table)} cascade`);
  }

  const rows = await source.query(
    `select ${columns.map(quoteIdent).join(", ")} from public.${quoteIdent(table)}`,
  );

  if (rows.rowCount === 0) {
    console.log(`${table}: source empty`);
    return { table, sourceCount, targetCountBefore, inserted: 0, skipped: false };
  }

  const quotedColumns = columns.map(quoteIdent).join(", ");
  let inserted = 0;

  for (const row of rows.rows) {
    const values = columns.map((column) => row[column]);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    await target.query(
      `insert into public.${quoteIdent(table)} (${quotedColumns}) values (${placeholders}) on conflict do nothing`,
      values,
    );
    inserted++;
  }

  const targetCountAfter = await getCount(target, table);
  console.log(`${table}: source=${sourceCount} target_before=${targetCountBefore} attempted_insert=${inserted} target_after=${targetCountAfter}`);
  return { table, sourceCount, targetCountBefore, targetCountAfter, inserted, skipped: false };
}

async function main() {
  console.log(apply ? "COPY MODE: APPLY" : "COPY MODE: DRY RUN");
  if (apply && truncate) console.log("Target tables with existing rows will be truncated first.");

  const source = new Pool({ connectionString: requiredEnv("RFP_DATABASE_URL") });
  const target = new Pool({ connectionString: requiredEnv("INTEL_DATABASE_URL") });

  try {
    const sourceDb = await source.query("select current_database() as database_name, current_user as user_name");
    const targetDb = await target.query("select current_database() as database_name, current_user as user_name");
    console.log("Source RFP DB:", sourceDb.rows[0]);
    console.log("Target Intel DB:", targetDb.rows[0]);

    const results = [];
    await target.query("begin");
    try {
      for (const table of INTEL_TABLES) {
        results.push(await copyTable(source, target, table));
      }

      if (apply) {
        await target.query("commit");
      } else {
        await target.query("rollback");
      }
    } catch (error) {
      await target.query("rollback");
      throw error;
    }

    console.table(results.map((row) => ({
      table: row.table,
      source: row.sourceCount,
      target_before: row.targetCountBefore,
      target_after: row.targetCountAfter ?? row.targetCountBefore,
      inserted_attempted: row.inserted,
      skipped: row.skipped,
    })));
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
