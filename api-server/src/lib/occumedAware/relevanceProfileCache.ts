/**
 * Last-known-good copy of the Neon relevance profile rows, used ONLY when Neon is unreachable.
 *
 * It is not a second source of relevance data:
 *   - it is written by the loader, from rows it just read from Neon, and by nothing else;
 *   - it lives outside the repository (runtime file, never committed);
 *   - it is version-bound: the stored version must equal the SHA-256 recomputed from the stored rows, and the
 *     signature (HMAC over the version, keyed by the Occu-Med database credential) must verify, so a hand-edited or
 *     truncated file, or one written by something without the credential, is rejected;
 *   - it expires after MAX_AGE_MS; an expired cache is treated as no cache.
 * Anything that fails these checks leaves the profile "unavailable" (fail closed).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { profileVersion, type ProfileRows } from "../search/relevanceProfile";

export const CACHE_FORMAT = "occumed-relevance-profile-cache/1";
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export function cachePath(): string {
  return process.env.RELEVANCE_PROFILE_CACHE_PATH || path.join(os.tmpdir(), "occumed-relevance-profile-cache.json");
}

function signingKey(): string {
  return process.env.OCCU_MED_AWARE_DATABASE_URL?.trim() || "";
}

function sign(version: string): string {
  return createHmac("sha256", signingKey()).update(version).digest("hex");
}

export interface CacheFile {
  format: string;
  version: string;
  signature: string;
  fetchedAt: string;
  rows: ProfileRows;
}

/** Atomic write; failure is non-fatal (the cache is best-effort). */
export function writeProfileCache(rows: ProfileRows, now = Date.now()): boolean {
  if (!signingKey()) return false;
  try {
    const version = profileVersion(rows);
    const file: CacheFile = { format: CACHE_FORMAT, version, signature: sign(version), fetchedAt: new Date(now).toISOString(), rows };
    const target = cachePath();
    mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(file), { mode: 0o600 });
    renameSync(tmp, target);
    return true;
  } catch {
    return false;
  }
}

export type CacheReadResult = { ok: true; rows: ProfileRows; version: string; fetchedAt: string } | { ok: false; reason: string };

export function readProfileCache(now = Date.now()): CacheReadResult {
  let file: CacheFile;
  try {
    file = JSON.parse(readFileSync(cachePath(), "utf8")) as CacheFile;
  } catch {
    return { ok: false, reason: "no readable cache" };
  }
  if (!signingKey()) return { ok: false, reason: "no signing credential" };
  if (file?.format !== CACHE_FORMAT || !file.rows || !Array.isArray(file.rows.terms) || !Array.isArray(file.rows.rules)
    || !Array.isArray(file.rows.facts) || !Array.isArray(file.rows.policies)) {
    return { ok: false, reason: "unrecognized cache format" };
  }
  const recomputed = profileVersion(file.rows);
  if (recomputed !== file.version) return { ok: false, reason: "checksum mismatch" };
  const expected = Buffer.from(sign(file.version), "hex");
  const actual = Buffer.from(String(file.signature ?? ""), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: "signature mismatch" };
  const age = now - Date.parse(file.fetchedAt);
  if (!Number.isFinite(age) || age < 0 || age > CACHE_MAX_AGE_MS) return { ok: false, reason: "cache expired" };
  return { ok: true, rows: file.rows, version: file.version, fetchedAt: file.fetchedAt };
}
