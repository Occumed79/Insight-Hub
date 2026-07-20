import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SCHEMA_DIR = path.join(ROOT, "lib/db/src/schema");

const RFP_TABLES = new Set([
  "opportunities",
  "opportunity_feedback",
  "opportunity_ingestion_runs",
  "opportunity_ingestion_run_sources",
  "opportunity_raw_records",
  "opportunity_staging",
  "opportunity_source_registry",
  "opportunity_dedupe_keys",
  "settings",
]);

const INTEL_TABLES = new Set([
  "federal_intel_items",
  "state_profiles",
  "state_agency_items",
  "state_intel_items",
  "intel_feed_items",
  "intel_feed_signals",
  "source_monitor_items",
  "source_monitor_runs",
  "clients",
  "client_branches",
  "client_contacts",
  "prospects",
  "prospect_locations",
  "prospect_jobs",
  "prospect_contacts",
  "competitors",
  "branch_hiring_posts",
]);

export function databaseIdentity(connectionString: string): string {
  const url = new URL(connectionString);
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname.replace(/\/$/, "")}`;
}

async function exportedSchemaModules(
  schemaFile: "rfp.ts" | "intel.ts",
): Promise<string[]> {
  const content = await readFile(path.join(SCHEMA_DIR, schemaFile), "utf8");
  return Array.from(content.matchAll(/export \* from "\.\/(.+?)";/g)).map(
    (match) => `${match[1]}.ts`,
  );
}

async function tablesInModules(modules: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  for (const module of modules) {
    const content = await readFile(path.join(SCHEMA_DIR, module), "utf8");
    for (const match of content.matchAll(/pgTable\(\s*["']([^"']+)["']/g))
      result.add(match[1]);
  }
  return result;
}

async function assertNoRuntimeDatabaseFallback(): Promise<void> {
  const roots = [
    path.join(ROOT, "lib/db/src"),
    path.join(ROOT, "api-server/src"),
  ];
  const queue = [...roots];
  const offending: string[] = [];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(target);
      else if (entry.name.endsWith(".ts")) {
        const content = await readFile(target, "utf8");
        if (/process\.env(?:\.|\[["'])DATABASE_URL/.test(content))
          offending.push(path.relative(ROOT, target));
      }
    }
  }
  if (offending.length > 0)
    throw new Error(
      `Runtime DATABASE_URL fallback found in: ${offending.join(", ")}`,
    );
}

export async function verifyDatabaseSilo(env = process.env): Promise<void> {
  const rfpUrl = env.RFP_DATABASE_URL;
  const intelUrl = env.INTEL_DATABASE_URL;
  if (!rfpUrl || !intelUrl)
    throw new Error(
      "RFP_DATABASE_URL and INTEL_DATABASE_URL must both be configured.",
    );
  if (databaseIdentity(rfpUrl) === databaseIdentity(intelUrl)) {
    throw new Error(
      "RFP_DATABASE_URL and INTEL_DATABASE_URL resolve to the same database.",
    );
  }

  const [rfpModules, intelModules] = await Promise.all([
    exportedSchemaModules("rfp.ts"),
    exportedSchemaModules("intel.ts"),
  ]);
  const [rfpTables, intelTables] = await Promise.all([
    tablesInModules(rfpModules),
    tablesInModules(intelModules),
  ]);
  const rfpLeaks = [...rfpTables].filter((table) => INTEL_TABLES.has(table));
  const intelLeaks = [...intelTables].filter((table) => RFP_TABLES.has(table));
  if (rfpLeaks.length > 0)
    throw new Error(`RFP schema exports intel tables: ${rfpLeaks.join(", ")}`);
  if (intelLeaks.length > 0)
    throw new Error(
      `Intel schema exports RFP tables: ${intelLeaks.join(", ")}`,
    );
  for (const required of RFP_TABLES) {
    if (!rfpTables.has(required))
      throw new Error(
        `RFP schema is missing required table export: ${required}`,
      );
  }
  await assertNoRuntimeDatabaseFallback();
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  verifyDatabaseSilo()
    .then(() => console.log("Database silo verification passed."))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
