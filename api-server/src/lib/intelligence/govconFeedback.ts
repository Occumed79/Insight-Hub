import { createHash } from "node:crypto";
import { like } from "drizzle-orm";
import { rfpDb } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";

export type GovConFeedbackMode = "forecast" | "recompete";

export interface GovConFeedbackRecord {
  mode: GovConFeedbackMode;
  recordId: string;
  fingerprint: string;
  title: string;
  agency: string;
  verdict: "not_relevant";
  updatedAt: string;
}

export interface GovConSuppressionSet {
  recordIds: Set<string>;
  fingerprints: Set<string>;
}

const KEY_PREFIX = "internal:govcon-feedback:";
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<GovConFeedbackMode, { expiresAt: number; value: GovConSuppressionSet }>();

function normalizeFingerprintPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 300);
}

export function govConRecordFingerprint(title: string, agency: string): string {
  return createHash("sha256")
    .update(`${normalizeFingerprintPart(title)}|${normalizeFingerprintPart(agency)}`)
    .digest("hex");
}

function feedbackKey(mode: GovConFeedbackMode, recordId: string, fingerprint: string): string {
  const keyHash = createHash("sha256").update(`${recordId}|${fingerprint}`).digest("hex");
  return `${KEY_PREFIX}${mode}:${keyHash}`;
}

function emptySuppressionSet(): GovConSuppressionSet {
  return { recordIds: new Set<string>(), fingerprints: new Set<string>() };
}

export async function loadGovConSuppressions(mode: GovConFeedbackMode): Promise<GovConSuppressionSet> {
  const cached = cache.get(mode);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const prefix = `${KEY_PREFIX}${mode}:%`;
  const rows = await rfpDb
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(like(settingsTable.key, prefix));

  const value = emptySuppressionSet();
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.value) as Partial<GovConFeedbackRecord>;
      if (parsed.verdict !== "not_relevant") continue;
      if (typeof parsed.recordId === "string" && parsed.recordId) value.recordIds.add(parsed.recordId);
      if (typeof parsed.fingerprint === "string" && parsed.fingerprint) value.fingerprints.add(parsed.fingerprint);
    } catch {
      // Ignore malformed historical settings instead of blocking the workspace.
    }
  }

  cache.set(mode, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function isGovConRecordSuppressed(
  suppressions: GovConSuppressionSet,
  record: { id: string; title: string; agency: string },
): boolean {
  return (
    suppressions.recordIds.has(record.id) ||
    suppressions.fingerprints.has(govConRecordFingerprint(record.title, record.agency))
  );
}

export async function saveGovConNotRelevant(input: {
  mode: GovConFeedbackMode;
  recordId: string;
  title: string;
  agency: string;
}): Promise<void> {
  const fingerprint = govConRecordFingerprint(input.title, input.agency);
  const payload: GovConFeedbackRecord = {
    mode: input.mode,
    recordId: input.recordId,
    fingerprint,
    title: input.title.slice(0, 500),
    agency: input.agency.slice(0, 300),
    verdict: "not_relevant",
    updatedAt: new Date().toISOString(),
  };

  await rfpDb
    .insert(settingsTable)
    .values({
      key: feedbackKey(input.mode, input.recordId, fingerprint),
      value: JSON.stringify(payload),
    })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: JSON.stringify(payload) },
    });

  cache.delete(input.mode);
}

export async function restoreGovConFeedback(mode: GovConFeedbackMode): Promise<number> {
  const rows = await rfpDb
    .delete(settingsTable)
    .where(like(settingsTable.key, `${KEY_PREFIX}${mode}:%`))
    .returning({ key: settingsTable.key });
  cache.delete(mode);
  return rows.length;
}
