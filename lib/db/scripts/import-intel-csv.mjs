import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultImportDir = path.resolve(__dirname, "../import-data/intel");
const importDir = path.resolve(process.env.INTEL_IMPORT_DIR ?? defaultImportDir);
const apply = process.argv.includes("--apply");
const truncateTarget = process.argv.includes("--truncate-target");

const TABLES = [
  "state_profiles",
  "clients",
  "competitors",
  "prospects",
  "client_branches",
  "prospect_locations",
  "federal_intel_items",
  "intel_feed_items",
  "intel_feed_signals",
  "source_monitor_items",
  "source_monitor_runs",
  "state_agency_items",
  "state_intel_items",
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // Ignore CR. LF handles row ending.
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((value) => value !== ""));
}

async function getColumns(client, table) {
  const result = await client.query(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position`,
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

async function getCount(client, table) {
  const result = await client.query(`select count(*)::int as count from public.${quoteIdent(table)}`);
  return Number(result.rows[0]?.count ?? 0);
}

async function importTable(client, table) {
  const csvPath = path.join(importDir, `${table}.csv`);
  if (!fs.existsSync(csvPath)) {
    console.log(`${table}: missing CSV, skipped`);
    return { table, csvRows: 0, targetBefore: null, targetAfter: null, skipped: true };
  }

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  if (rows.length === 0) {
    console.log(`${table}: empty CSV, skipped`);
    return { table, csvRows: 0, targetBefore: null, targetAfter: null, skipped: true };
  }

  const [header, ...dataRows] = rows;
  const targetColumns = await getColumns(client, table);
  if (targetColumns.length === 0) throw new Error(`Target table missing or has no columns: ${table}`);

  const columns = header.filter((column) => targetColumns.includes(column));
  if (columns.length === 0) throw new Error(`No shared columns found for ${table}`);

  const columnIndexes = columns.map((column) => header.indexOf(column));
  const targetBefore = await getCount(client, table);

  if (!apply) {
    console.log(`${table}: dry-run csv_rows=${dataRows.length} target_before=${targetBefore}`);
    return { table, csvRows: dataRows.length, targetBefore, targetAfter: targetBefore, skipped: false };
  }

  const quotedColumns = columns.map(quoteIdent).join(", ");
  let attempted = 0;

  for (const row of dataRows) {
    const values = columnIndexes.map((index) => {
      const value = row[index] ?? "";
      return value === "" ? null : value;
    });
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    await client.query(
      `insert into public.${quoteIdent(table)} (${quotedColumns}) values (${placeholders}) on conflict do nothing`,
      values,
    );
    attempted++;
  }

  const targetAfter = await getCount(client, table);
  console.log(`${table}: csv_rows=${dataRows.length} target_before=${targetBefore} attempted=${attempted} target_after=${targetAfter}`);
  return { table, csvRows: dataRows.length, targetBefore, targetAfter, skipped: false };
}

async function main() {
  if (!fs.existsSync(importDir)) {
    throw new Error(`Import directory does not exist: ${importDir}`);
  }

  console.log(apply ? "INTEL CSV IMPORT: APPLY" : "INTEL CSV IMPORT: DRY RUN");
  console.log(`Import directory: ${importDir}`);
  if (apply && truncateTarget) console.log("Target import tables will be truncated first.");

  const pool = new Pool({ connectionString: requiredEnv("INTEL_DATABASE_URL") });
  const client = await pool.connect();

  try {
    const dbInfo = await client.query("select current_database() as database_name, current_user as user_name");
    console.log("Target Intel DB:", dbInfo.rows[0]);

    const results = [];
    await client.query("begin");
    try {
      if (apply && truncateTarget) {
        await client.query(`truncate table ${TABLES.map((table) => `public.${quoteIdent(table)}`).join(", ")} cascade`);
      }

      for (const table of TABLES) {
        results.push(await importTable(client, table));
      }

      if (apply) {
        await client.query("commit");
      } else {
        await client.query("rollback");
      }
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    console.table(results);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
