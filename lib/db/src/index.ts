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

export function runWithDbContext<T>(logicalDatabase: LogicalDatabase, callback: () => T): T {
  return dbContext.run(logicalDatabase, callback);
}

export function getActiveLogicalDatabase(): LogicalDatabase {
  return dbContext.getStore() ?? "rfp";
}

export const rfpPool = new Pool({ connectionString: requiredConnectionString("RFP_DATABASE_URL") });
export const intelPool = new Pool({ connectionString: requiredConnectionString("INTEL_DATABASE_URL") });

export const rfpDb = drizzle(rfpPool, { schema: rfpSchema });
export const intelDb = drizzle(intelPool, { schema: intelSchema });

const dynamicDb = new Proxy({}, {
  get(_target, property) {
    const activeDb = getActiveLogicalDatabase() === "intel" ? intelDb : rfpDb;
    const value = (activeDb as any)[property];
    return typeof value === "function" ? value.bind(activeDb) : value;
  },
});

// Existing imports of `db` use request-scoped logical routing.
// RFP paths default to rfpDb; configured non-RFP API paths use intelDb.
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
