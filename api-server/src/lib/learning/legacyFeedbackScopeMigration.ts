/**
 * One-time compatibility migration of learned-feedback context keys.
 *
 * Learned feedback is stored per context (`settings` key `feedback-context:v1:<hash of context>`), and a service-line
 * context used to be built from a fixed set of scope names. Contexts now use the canonical Neon category ids, so
 * feedback recorded under the old names would silently stop applying. This maps each old scope key to its canonical
 * category using the Neon alias facts (`feedback_scope_alias`, on the relevance profile) and carries the state
 * across. The old-key -> category mapping lives in Neon, not here.
 *
 * Safety:
 *  - nothing is deleted: the old row is kept and marked `legacyMigratedTo`;
 *  - a context that cannot be fully mapped is left untouched and counted as unmapped;
 *  - it is idempotent (marked rows are skipped), so running it again does nothing;
 *  - contexts already in canonical form (`query:` contexts, canonical scopes) are not touched.
 */
import { contextHash, type ContextSignalState } from "./contextualFeedback";
import type { RelevanceProfile } from "../search/relevanceProfile";

export const FEEDBACK_KEY_PREFIX = "feedback-context:v1:";

export interface FeedbackRow {
  key: string;
  value: string;
}
export interface FeedbackTx {
  read(key: string): Promise<string | undefined>;
  write(key: string, value: string): Promise<void>;
}
export interface FeedbackStore {
  list(): Promise<FeedbackRow[]>;
  /** Runs `fn` atomically with the given keys locked. */
  transaction(keys: string[], fn: (tx: FeedbackTx) => Promise<void>): Promise<void>;
}

export interface MigrationReport {
  total: number;
  mapped: number;
  /** Old-key contexts that could not be fully mapped; kept untouched. */
  unmapped: Array<{ key: string; context: string; reason: string }>;
  /** Already canonical, non-scope, malformed, or previously migrated. */
  skipped: number;
}

const idToToken = (id: string): string => id.replace(/_/g, "-");

type Parsed = { tokens: string[]; rest: string } | null;
function parseScopeContext(context: string): Parsed {
  if (!context.startsWith("scope:")) return null;
  const body = context.slice("scope:".length);
  const space = body.indexOf(" ");
  const head = space === -1 ? body : body.slice(0, space);
  const rest = space === -1 ? "" : body.slice(space);
  return { tokens: head.split("+").filter(Boolean), rest };
}

/** Pure: the canonical context for a legacy context, or why it cannot be mapped. */
export function mapLegacyContext(
  context: string,
  aliases: RelevanceProfile["feedbackScopeAliases"],
): { kind: "mapped"; context: string } | { kind: "skip" } | { kind: "unmapped"; reason: string } {
  const parsed = parseScopeContext(context);
  if (!parsed || parsed.tokens.length === 0) return { kind: "skip" };
  const aliased = parsed.tokens.filter((t) => aliases[t] && aliases[t]!.length > 0);
  if (aliased.length === 0) return { kind: "skip" };
  if (aliased.length !== parsed.tokens.length) {
    return { kind: "unmapped", reason: `scope key(s) without alias: ${parsed.tokens.filter((t) => !aliased.includes(t)).join(", ")}` };
  }
  const next = Array.from(new Set(parsed.tokens.flatMap((t) => aliases[t]!.map(idToToken)))).sort();
  const mapped = `scope:${next.join("+")}${parsed.rest}`;
  return mapped === context ? { kind: "skip" } : { kind: "mapped", context: mapped };
}

function addMaps(into: Record<string, number>, from: Record<string, number> | undefined): void {
  for (const [k, v] of Object.entries(from ?? {})) {
    const next = (into[k] ?? 0) + v;
    if (Math.abs(next) < 0.000001) delete into[k];
    else into[k] = next;
  }
}

/** Pure: merge a legacy state into the canonical context's state (existing grades win, signal maps are summed). */
export function mergeFeedbackState(target: ContextSignalState | null, legacy: ContextSignalState, context: string): ContextSignalState {
  const base: ContextSignalState = target ?? {
    context,
    contextHash: contextHash(context),
    grades: 0,
    gradesByOpportunity: {},
    agencies: {},
    naics: {},
    tags: {},
    keywords: {},
    updatedAt: new Date(0).toISOString(),
  };
  const merged: ContextSignalState = {
    ...base,
    context,
    contextHash: contextHash(context),
    gradesByOpportunity: { ...legacy.gradesByOpportunity, ...base.gradesByOpportunity },
    agencies: { ...base.agencies },
    naics: { ...base.naics },
    tags: { ...base.tags },
    keywords: { ...base.keywords },
  };
  addMaps(merged.agencies, legacy.agencies);
  addMaps(merged.naics, legacy.naics);
  addMaps(merged.tags, legacy.tags);
  addMaps(merged.keywords, legacy.keywords);
  merged.grades = Object.keys(merged.gradesByOpportunity).length;
  merged.updatedAt = new Date().toISOString();
  return merged;
}

function parseState(raw: string): (ContextSignalState & { legacyMigratedTo?: string }) | null {
  try {
    const s = JSON.parse(raw);
    return s && typeof s === "object" && typeof s.context === "string" ? s : null;
  } catch {
    return null;
  }
}

export async function migrateLegacyFeedbackScopes(
  profile: Pick<RelevanceProfile, "feedbackScopeAliases">,
  store: FeedbackStore,
): Promise<MigrationReport> {
  const report: MigrationReport = { total: 0, mapped: 0, unmapped: [], skipped: 0 };
  const rows = (await store.list()).filter((r) => r.key.startsWith(FEEDBACK_KEY_PREFIX));
  report.total = rows.length;
  for (const row of rows) {
    const state = parseState(row.value);
    if (!state || state.legacyMigratedTo) {
      report.skipped += 1;
      continue;
    }
    const mapping = mapLegacyContext(state.context, profile.feedbackScopeAliases);
    if (mapping.kind === "skip") {
      report.skipped += 1;
      continue;
    }
    if (mapping.kind === "unmapped") {
      report.unmapped.push({ key: row.key, context: state.context, reason: mapping.reason });
      continue;
    }
    const newHash = contextHash(mapping.context);
    const newKey = `${FEEDBACK_KEY_PREFIX}${newHash}`;
    await store.transaction([row.key, newKey], async (tx) => {
      const currentRaw = await tx.read(row.key);
      const current = currentRaw ? parseState(currentRaw) : null;
      if (!current || current.legacyMigratedTo) return;
      const targetRaw = await tx.read(newKey);
      const target = targetRaw ? parseState(targetRaw) : null;
      await tx.write(newKey, JSON.stringify(mergeFeedbackState(target, current, mapping.context)));
      await tx.write(row.key, JSON.stringify({ ...current, legacyMigratedTo: newHash, legacyMigratedAt: new Date().toISOString() }));
    });
    report.mapped += 1;
  }
  return report;
}

/** Production store over the RFP database `settings` table. */
export async function pgFeedbackStore(): Promise<FeedbackStore> {
  const { rfpPool } = await import("@workspace/db");
  return {
    async list() {
      const res = await rfpPool.query<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE $1", [`${FEEDBACK_KEY_PREFIX}%`]);
      return res.rows;
    },
    async transaction(keys, fn) {
      const client = await rfpPool.connect();
      try {
        await client.query("BEGIN");
        for (const key of [...keys].sort()) await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
        await fn({
          async read(key) {
            const r = await client.query<{ value: string }>("SELECT value FROM settings WHERE key = $1 FOR UPDATE", [key]);
            return r.rows[0]?.value;
          },
          async write(key, value) {
            await client.query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, value]);
          },
        });
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

let migratedForVersion: string | null = null;
/** Run once per process (and again only if the profile version changes). Never throws. */
export async function runLegacyFeedbackScopeMigration(profile: RelevanceProfile): Promise<MigrationReport | null> {
  if (profile.source === "unavailable" || Object.keys(profile.feedbackScopeAliases).length === 0) return null;
  if (migratedForVersion === profile.version) return null;
  try {
    const report = await migrateLegacyFeedbackScopes(profile, await pgFeedbackStore());
    migratedForVersion = profile.version;
    console.warn(JSON.stringify({ event: "legacy_feedback_scope_migration", total: report.total, mapped: report.mapped, unmapped: report.unmapped.length, skipped: report.skipped, profileVersion: profile.version }));
    return report;
  } catch (error) {
    console.warn(JSON.stringify({ event: "legacy_feedback_scope_migration_failed", error: error instanceof Error ? error.message.slice(0, 200) : String(error) }));
    return null;
  }
}
