/**
 * Loads the Occu-Med relevance profile from OCCU_MED_AWARE (Neon) and publishes it for the classifier.
 *
 * The DB transport is injectable so the exact SQL below can be exercised against rows reconstructed from
 * the migration files in tests; in production it is `queryOccuMedAware`.
 *
 * There are no row caps: every active term, current rule and current fact is read.
 */
import {
  buildProfile,
  getRelevanceProfile,
  profileCompleteness,
  setRelevanceProfile,
  type ProfileFactRow,
  type ProfilePolicyRow,
  type ProfileRows,
  type ProfileRuleRow,
  type ProfileTermRow,
  type RelevanceProfile,
} from "../search/relevanceProfile";
import { isOccuMedAwareConfigured, queryOccuMedAware } from "./db";
import { readProfileCache, writeProfileCache } from "./relevanceProfileCache";

export type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[], timeoutMs?: number) => Promise<T[]>;

export const PROFILE_SQL = {
  terms: `SELECT phrase, term_type, match_strength, target_keys, metadata
          FROM occumed_core.rfp_search_terms WHERE active = true`,
  rules: `SELECT v.rule_key, v.category, v.title, v.rule_text, v.machine_action, v.hard_rule, v.priority, v.scope, r.search_triggers
          FROM occumed_core.v_current_rules v JOIN occumed_core.rules r ON r.id = v.id`,
  facts: `SELECT fact_key, category, predicate, value_text, value_json, value_numeric
          FROM occumed_core.v_current_facts`,
  policies: `SELECT policy_key, applies_to, title, instruction, priority, must_follow
             FROM occumed_core.agent_policies WHERE active = true`,
} as const;

const PROFILE_QUERY_TIMEOUT_MS = 15_000;

export async function fetchProfileRows(query: QueryFn): Promise<ProfileRows> {
  const [terms, rules, facts, policies] = await Promise.all([
    query<ProfileTermRow>(PROFILE_SQL.terms, [], PROFILE_QUERY_TIMEOUT_MS),
    query<ProfileRuleRow>(PROFILE_SQL.rules, [], PROFILE_QUERY_TIMEOUT_MS),
    query<ProfileFactRow>(PROFILE_SQL.facts, [], PROFILE_QUERY_TIMEOUT_MS),
    query<ProfilePolicyRow>(PROFILE_SQL.policies, [], PROFILE_QUERY_TIMEOUT_MS),
  ]);
  return { terms, rules, facts, policies };
}

export interface ProfileRefreshResult {
  applied: boolean;
  source: RelevanceProfile["source"];
  version: string;
  missing: string[];
  error?: string;
}

function result(applied: boolean, missing: string[], error?: string): ProfileRefreshResult {
  const p = getRelevanceProfile();
  return { applied, source: p.source, version: p.version, missing, ...(error ? { error } : {}) };
}

/**
 * Fallback when Neon cannot supply a complete profile: keep what is already published (a live or cached profile);
 * otherwise try the verified last-known-good cache; otherwise stay "unavailable" (fail closed, see relevanceProfile.ts).
 */
function fallBack(reason: string): void {
  if (getRelevanceProfile().source !== "unavailable") return;
  const cached = readProfileCache();
  if (!cached.ok) {
    console.warn(JSON.stringify({ event: "relevance_profile_unavailable", reason, cache: cached.reason }));
    return;
  }
  const applied = setRelevanceProfile(buildProfile(cached.rows, "cache"));
  console.warn(JSON.stringify({ event: "relevance_profile_from_cache", reason, fetchedAt: cached.fetchedAt, applied: applied.applied, version: cached.version }));
}

/**
 * Fetch, build and publish. A complete Neon profile is applied and written to the verified cache. An incomplete one
 * (for example before the migration is activated) or a Neon failure is not applied; see `fallBack`.
 */
export async function refreshRelevanceProfile(query: QueryFn = queryOccuMedAware as QueryFn): Promise<ProfileRefreshResult> {
  try {
    const rows = await fetchProfileRows(query);
    const applied = setRelevanceProfile(buildProfile(rows, "neon"));
    if (!applied.applied) {
      console.warn(JSON.stringify({ event: "relevance_profile_incomplete", missing: applied.missing, using: getRelevanceProfile().source }));
      fallBack("incomplete");
      return result(false, applied.missing);
    }
    writeProfileCache(rows);
    return result(true, []);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : String(error);
    console.warn(JSON.stringify({ event: "relevance_profile_load_failed", error: message, using: getRelevanceProfile().source }));
    fallBack("neon_error");
    return result(false, [], message);
  }
}

const REFRESH_TTL_MS = 10 * 60_000;
let lastAttemptAt = 0;
let inflight: Promise<ProfileRefreshResult> | null = null;

/** Refresh at most once per TTL; safe to call from hot paths. */
export function ensureRelevanceProfile(force = false): Promise<ProfileRefreshResult> {
  if (!isOccuMedAwareConfigured()) {
    return Promise.resolve(result(false, ["OCCU_MED_AWARE_DATABASE_URL not configured"]));
  }
  if (inflight) return inflight;
  if (!force && Date.now() - lastAttemptAt < REFRESH_TTL_MS) {
    return Promise.resolve(result(getRelevanceProfile().source === "neon", []));
  }
  lastAttemptAt = Date.now();
  inflight = refreshRelevanceProfile().finally(() => {
    inflight = null;
  });
  return inflight;
}

export { profileCompleteness };
