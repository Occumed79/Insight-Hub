import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as rfpSchema from "./schema/rfp";
import * as intelSchema from "./schema/intel";

const { Pool } = pg;

type LogicalDatabase = "rfp" | "intel";
type ConnectionEnvName = "RFP_DATABASE_URL" | "INTEL_DATABASE_URL";

type DatabaseRoleProbe = {
  hasOpportunities: boolean;
  hasCompetitors: boolean;
  hasProspects: boolean;
  hasClients: boolean;
  hasFederalIntel: boolean;
};

const dbContext = new AsyncLocalStorage<LogicalDatabase>();

function requiredConnectionString(envName: ConnectionEnvName): string {
  const value = process.env[envName];

  if (!value) {
    throw new Error(`${envName} must be set. Insight Hub no longer falls back to DATABASE_URL for siloed database routing.`);
  }

  return value;
}

function safeConnectionSummary(envName: ConnectionEnvName) {
  const logicalDatabase = envName === "RFP_DATABASE_URL" ? "rfp" : "intel";
  const raw = requiredConnectionString(envName);

  try {
    const url = new URL(raw);
    return {
      logicalDatabase,
      source: envName,
      host: url.hostname,
      database: url.pathname.replace(/^\//, "") || "neondb",
    };
  } catch {
    return { logicalDatabase, source: envName, host: "invalid-url", database: "unknown" };
  }
}

function connectionTarget(envName: ConnectionEnvName): string {
  const url = new URL(requiredConnectionString(envName));
  return `${url.hostname}${url.pathname}`;
}

function boundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function createPool(
  logicalDatabase: LogicalDatabase,
  envName: ConnectionEnvName,
): pg.Pool {
  const pool = new Pool({
    connectionString: requiredConnectionString(envName),
    max: boundedIntegerEnv("DATABASE_POOL_MAX", 3, 1, 8),
    min: 0,
    idleTimeoutMillis: boundedIntegerEnv(
      "DATABASE_POOL_IDLE_TIMEOUT_MS",
      20_000,
      5_000,
      120_000,
    ),
    connectionTimeoutMillis: boundedIntegerEnv(
      "DATABASE_CONNECT_TIMEOUT_MS",
      8_000,
      2_000,
      30_000,
    ),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: false,
  });

  pool.on("error", (error) => {
    console.error(
      JSON.stringify({
        event: "database_pool_error",
        logicalDatabase,
        code:
          typeof (error as Error & { code?: unknown }).code === "string"
            ? (error as Error & { code: string }).code
            : undefined,
        message: error.message,
      }),
    );
  });

  return pool;
}

async function probeDatabaseRole(pool: pg.Pool): Promise<DatabaseRoleProbe> {
  const result = await pool.query<{
    opportunities: string | null;
    competitors: string | null;
    prospects: string | null;
    clients: string | null;
    federal_intel_items: string | null;
  }>(`
    SELECT
      to_regclass('public.opportunities')::text AS opportunities,
      to_regclass('public.competitors')::text AS competitors,
      to_regclass('public.prospects')::text AS prospects,
      to_regclass('public.clients')::text AS clients,
      to_regclass('public.federal_intel_items')::text AS federal_intel_items
  `);
  const row = result.rows[0];

  return {
    hasOpportunities: Boolean(row?.opportunities),
    hasCompetitors: Boolean(row?.competitors),
    hasProspects: Boolean(row?.prospects),
    hasClients: Boolean(row?.clients),
    hasFederalIntel: Boolean(row?.federal_intel_items),
  };
}

export function runWithDbContext<T>(logicalDatabase: LogicalDatabase, callback: () => T): T {
  return dbContext.run(logicalDatabase, callback);
}

export function getActiveLogicalDatabase(): LogicalDatabase {
  return dbContext.getStore() ?? "rfp";
}

export const rfpPool = createPool("rfp", "RFP_DATABASE_URL");
export const intelPool = createPool("intel", "INTEL_DATABASE_URL");

export const rfpDb = drizzle(rfpPool, { schema: rfpSchema });
export const intelDb = drizzle(intelPool, { schema: intelSchema });

const dynamicDb = new Proxy({}, {
  get(_target, property) {
    const activeDb = getActiveLogicalDatabase() === "intel" ? intelDb : rfpDb;
    const value = (activeDb as any)[property];
    return typeof value === "function" ? value.bind(activeDb) : value;
  },
});

export const db = dynamicDb as typeof rfpDb & typeof intelDb;
export const pool = rfpPool;

export function getDatabaseConfigSummary() {
  return {
    rfp: safeConnectionSummary("RFP_DATABASE_URL"),
    intel: safeConnectionSummary("INTEL_DATABASE_URL"),
  };
}

export async function verifyDatabaseRouting() {
  if (connectionTarget("RFP_DATABASE_URL") === connectionTarget("INTEL_DATABASE_URL")) {
    throw new Error("RFP_DATABASE_URL and INTEL_DATABASE_URL resolve to the same database target.");
  }

  const [rfp, intel] = await Promise.all([
    probeDatabaseRole(rfpPool),
    probeDatabaseRole(intelPool),
  ]);

  if (!rfp.hasOpportunities) {
    throw new Error("RFP_DATABASE_URL does not contain the required public.opportunities table.");
  }

  const missingIntelTables = [
    !intel.hasCompetitors ? "competitors" : null,
    !intel.hasProspects ? "prospects" : null,
    !intel.hasClients ? "clients" : null,
    !intel.hasFederalIntel ? "federal_intel_items" : null,
  ].filter((name): name is string => Boolean(name));

  if (missingIntelTables.length > 0) {
    throw new Error(
      `INTEL_DATABASE_URL is missing required Intel tables: ${missingIntelTables.join(", ")}.`,
    );
  }

  return {
    config: getDatabaseConfigSummary(),
    roles: { rfp, intel },
  };
}

export * from "./schema";
export { rfpSchema, intelSchema };
