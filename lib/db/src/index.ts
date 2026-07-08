import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import * as rfpSchema from "./schema/rfp";
import * as intelSchema from "./schema/intel";

const { Pool } = pg;

type LogicalDatabase = "rfp" | "intel";

const dbContext = new AsyncLocalStorage<LogicalDatabase>();

function connectionStringFor(primaryEnvName: "RFP_DATABASE_URL" | "INTEL_DATABASE_URL"): string {
  const value = process.env[primaryEnvName] ?? process.env.DATABASE_URL;

  if (!value) {
    throw new Error(
      `${primaryEnvName} must be set. DATABASE_URL is allowed only as a temporary fallback during migration.`,
    );
  }

  return value;
}

function safeConnectionSummary(primaryEnvName: "RFP_DATABASE_URL" | "INTEL_DATABASE_URL") {
  const source = process.env[primaryEnvName] ? primaryEnvName : "DATABASE_URL";
  return { logicalDatabase: primaryEnvName === "RFP_DATABASE_URL" ? "rfp" : "intel", source };
}

export function runWithDbContext<T>(logicalDatabase: LogicalDatabase, callback: () => T): T {
  return dbContext.run(logicalDatabase, callback);
}

export function getActiveLogicalDatabase(): LogicalDatabase {
  return dbContext.getStore() ?? "rfp";
}

export const rfpPool = new Pool({ connectionString: connectionStringFor("RFP_DATABASE_URL") });
export const intelPool = new Pool({ connectionString: connectionStringFor("INTEL_DATABASE_URL") });

export const rfpDb = drizzle(rfpPool, { schema: rfpSchema });
export const intelDb = drizzle(intelPool, { schema: intelSchema });

const dynamicDb = new Proxy({}, {
  get(_target, property) {
    const activeDb = getActiveLogicalDatabase() === "intel" ? intelDb : rfpDb;
    const value = (activeDb as any)[property];
    return typeof value === "function" ? value.bind(activeDb) : value;
  },
});

// Backward-compatible exports. Existing RFP code can continue importing `db` while
// request middleware routes non-RFP API paths to the intel DB context.
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
