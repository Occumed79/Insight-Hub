/**
 * OCCU_MED_AWARE database connection.
 *
 * pg is used at runtime via require (it is available because @workspace/db
 * depends on it), without importing its type declarations which are not in
 * this package's type path.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// Intentionally untyped — pg is a transitive runtime dep only, no @types/pg here.
let _pool: any | null = null;

export function isOccuMedAwareConfigured(): boolean {
  return Boolean(process.env.OCCU_MED_AWARE_DATABASE_URL?.trim());
}

function getPool(): any {
  if (!_pool) {
    const connectionString = process.env.OCCU_MED_AWARE_DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error("OCCU_MED_AWARE_DATABASE_URL is not configured");
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg");
    _pool = new Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });
    _pool.on("error", (err: Error) => {
      console.warn(
        JSON.stringify({
          event: "occumed_aware_pool_error",
          error: err.message.slice(0, 200),
        }),
      );
    });
  }
  return _pool;
}

export async function queryOccuMedAware<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  timeoutMs = 6_000,
): Promise<T[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${Math.floor(timeoutMs)}`);
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}
