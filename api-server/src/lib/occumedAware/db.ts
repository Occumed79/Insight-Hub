/**
 * OCCU_MED_AWARE database connection.
 *
 * pg is an external dependency (declared in build.mjs external list) resolved
 * from @workspace/db at runtime. We import it as a dynamic ESM import so that
 * esbuild leaves the "pg" specifier alone and the runtime module resolution
 * picks it up from the node_modules tree.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

let _pool: any | null = null;

export function isOccuMedAwareConfigured(): boolean {
  return Boolean(process.env.OCCU_MED_AWARE_DATABASE_URL?.trim());
}

async function getPool(): Promise<any> {
  if (_pool) return _pool;

  const connectionString = process.env.OCCU_MED_AWARE_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("OCCU_MED_AWARE_DATABASE_URL is not configured");
  }

  // Dynamic import keeps esbuild from attempting to bundle pg inline.
  // pg is marked external in build.mjs and resolved from @workspace/db at runtime.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — pg types are not in api-server's type path; resolved from @workspace/db at runtime
  const { default: pg } = await import("pg");
  const { Pool } = (pg as any).Pool ? (pg as any) : (pg as any).default ?? pg;

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
  return _pool;
}

export async function queryOccuMedAware<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  timeoutMs = 6_000,
): Promise<T[]> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${Math.floor(timeoutMs)}`);
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}
