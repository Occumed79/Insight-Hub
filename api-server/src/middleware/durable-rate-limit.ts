import { createHash } from "node:crypto";
import { rfpPool } from "@workspace/db";

interface DurableRateEntry {
  startedAt: number;
  count: number;
}

export interface DurableRateResult {
  allowed: boolean;
  retryAfterSeconds: number;
  count: number;
  limit: number;
}

const PREFIX = "api-rate:v2:";
const SWEEP_INTERVAL_MS = 5 * 60_000;
const lastSweepByBucket = new Map<string, number>();

function clientHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function parseEntry(raw: string | undefined): DurableRateEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DurableRateEntry>;
    if (
      typeof parsed.startedAt !== "number" ||
      !Number.isFinite(parsed.startedAt) ||
      typeof parsed.count !== "number" ||
      !Number.isFinite(parsed.count)
    ) {
      return null;
    }
    return {
      startedAt: Math.max(0, Math.floor(parsed.startedAt)),
      count: Math.max(0, Math.floor(parsed.count)),
    };
  } catch {
    return null;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function sweepExpired(
  bucketName: string,
  now: number,
  windowMs: number,
): Promise<void> {
  const previous = lastSweepByBucket.get(bucketName) ?? 0;
  if (now - previous < SWEEP_INTERVAL_MS) return;
  lastSweepByBucket.set(bucketName, now);

  const prefix = `${PREFIX}${bucketName}:`;
  const cutoff = now - windowMs;
  await rfpPool.query(
    `DELETE FROM settings
     WHERE key LIKE $1 ESCAPE '\\'
       AND value ~ '^\\{'
       AND COALESCE((value::jsonb ->> 'startedAt')::bigint, 0) < $2`,
    [`${escapeLike(prefix)}%`, cutoff],
  );
}

/**
 * Consume one request from a durable per-client limiter entry. Each bucket/client
 * pair has its own settings row and advisory lock, so unrelated clients do not
 * serialize behind one large shared JSON document. The existing settings KV
 * table keeps the state shared across API instances without a schema migration.
 */
export async function consumeDurableRateLimit(
  bucketName: string,
  clientIdentity: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<DurableRateResult> {
  const client = await rfpPool.connect();
  const hash = clientHash(clientIdentity);
  const key = `${PREFIX}${bucketName}:${hash}`;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const result = await client.query<{ value: string }>(
      "SELECT value FROM settings WHERE key = $1 FOR UPDATE",
      [key],
    );
    const existing = parseEntry(result.rows[0]?.value);
    const current =
      !existing || now - existing.startedAt >= windowMs
        ? { startedAt: now, count: 0 }
        : existing;

    if (current.count >= limit) {
      const retryAfterMs = Math.max(
        1,
        windowMs - (now - current.startedAt),
      );
      await client.query("COMMIT");
      void sweepExpired(bucketName, now, windowMs).catch(() => undefined);
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        count: current.count,
        limit,
      };
    }

    current.count += 1;
    await client.query(
      `INSERT INTO settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(current)],
    );
    await client.query("COMMIT");
    void sweepExpired(bucketName, now, windowMs).catch(() => undefined);
    return {
      allowed: true,
      retryAfterSeconds: 0,
      count: current.count,
      limit,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
