import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as rfpSchema from "./schema/rfp";
import * as intelSchema from "./schema/intel";

const { Pool } = pg;

type LogicalDatabase = "rfp" | "intel";

const dbContext = new AsyncLocalStorage<LogicalDatabase>();

function requiredConnectionString(envName: "RFP_DATABASE_URL" | "INTEL_DATABASE_URL"): string {
  const value = process.env[envName];

  if (!value) {
    throw new Error(`${envName} must be set. Insight Hub no longer falls back to DATABASE_URL for siloed database routing.`);
  }

  return value;
}

function safeConnectionSummary(envName: "RFP_DATABASE_URL" | "INTEL_DATABASE_URL") {
  return { logicalDatabase: envName === "RFP_DATABASE_URL" ? "rfp" : "intel", source: envName };
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
  envName: "RFP_DATABASE_URL" | "INTEL_DATABASE_URL",
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

export * from "./schema";
export { rfpSchema, intelSchema };
