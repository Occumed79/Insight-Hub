import { createHash } from "node:crypto";
import { rfpPool } from "@workspace/db";

interface DurableRateEntry {
  startedAt: number;
  count: number;
}

interface DurableRateBucket {
  version: 1;
  entries: Record<string, DurableRateEntry>;
}

export interface DurableRateResult {
  allowed: boolean;
  retryAfterSeconds: number;
  count: number;
  limit: number;
}

const PREFIX = "api-rate:v1:";
const MAX_CLIENTS_PER_BUCKET = 2_000;

function clientHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function parseBucket(raw: string | undefined): DurableRateBucket {
  if (!raw) return { version: 1, entries: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<DurableRateBucket>;
    return {
      version: 1,
      entries:
        parsed.entries && typeof parsed.entries === "object"
          ? parsed.entries
          : {},
    };
  } catch {
    return { version: 1, entries: {} };
  }
}

function prune(
  bucket: DurableRateBucket,
  now: number,
  windowMs: number,
): DurableRateBucket {
  const entries = Object.entries(bucket.entries)
    .filter(([, entry]) => now - entry.startedAt < windowMs)
    .sort((left, right) => right[1].startedAt - left[1].startedAt)
    .slice(0, MAX_CLIENTS_PER_BUCKET);
  return { version: 1, entries: Object.fromEntries(entries) };
}

/**
 * Consume one request from a shared limiter bucket. The entire client map for a
 * route bucket is stored under one existing settings KV key, so the limiter is
 * shared across API instances without creating unbounded per-IP database rows.
 */
export async function consumeDurableRateLimit(
  bucketName: string,
  clientIdentity: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<DurableRateResult> {
  const client = await rfpPool.connect();
  const key = `${PREFIX}${bucketName}`;
  const hash = clientHash(clientIdentity);
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const result = await client.query<{ value: string }>(
      "SELECT value FROM settings WHERE key = $1 FOR UPDATE",
      [key],
    );
    const bucket = prune(parseBucket(result.rows[0]?.value), now, windowMs);
    const existing = bucket.entries[hash];
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
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        count: current.count,
        limit,
      };
    }

    current.count += 1;
    bucket.entries[hash] = current;
    await client.query(
      `INSERT INTO settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(bucket)],
    );
    await client.query("COMMIT");
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
