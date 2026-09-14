import { rfpDb as db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { createCredentialSettingsCache } from "./credentialSettingsCache";

/**
 * Short-lived process-local snapshot of the shared settings table.
 *
 * Several first-paint endpoints read different prefixes from the same table.
 * Production intentionally runs with DATABASE_POOL_MAX=1, so separate reads
 * serialize behind the single connection and turn a cold page load into a
 * query queue. Coalescing them onto one snapshot preserves the existing data
 * model while eliminating duplicate cold-start SELECTs.
 */
const settingsSnapshotCache = createCredentialSettingsCache(async () => {
  const rows = await db
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable);
  return new Map(rows.map((row) => [row.key, row.value]));
}, 5_000);

export async function loadSettingsSnapshot(): Promise<ReadonlyMap<string, string>> {
  return settingsSnapshotCache.get();
}

export function invalidateSettingsSnapshotCache(): void {
  settingsSnapshotCache.invalidate();
}

export async function loadSettingsPrefix(
  prefix: string,
): Promise<Array<{ key: string; value: string }>> {
  const snapshot = await loadSettingsSnapshot();
  const rows: Array<{ key: string; value: string }> = [];
  for (const [key, value] of snapshot) {
    if (key.startsWith(prefix)) rows.push({ key, value });
  }
  return rows;
}
