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
  missing: string[];
  error?: string;
}

/**
 * Fetch, build and publish. An incomplete profile (for example before the migration is activated) is not
 * applied; the classifier then keeps using the snapshot and marks results `profileSource: "snapshot"`.
 */
export async function refreshRelevanceProfile(query: QueryFn = queryOccuMedAware as QueryFn): Promise<ProfileRefreshResult> {
  try {
    const profile = buildProfile(await fetchProfileRows(query), "neon");
    const applied = setRelevanceProfile(profile);
    if (!applied.applied) {
      console.warn(JSON.stringify({ event: "relevance_profile_incomplete", missing: applied.missing, using: getRelevanceProfile().source }));
    }
    return { applied: applied.applied, source: getRelevanceProfile().source, missing: applied.missing };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : String(error);
    console.warn(JSON.stringify({ event: "relevance_profile_load_failed", error: message, using: getRelevanceProfile().source }));
    return { applied: false, source: getRelevanceProfile().source, missing: [], error: message };
  }
}

const REFRESH_TTL_MS = 10 * 60_000;
let lastAttemptAt = 0;
let inflight: Promise<ProfileRefreshResult> | null = null;

/** Refresh at most once per TTL; safe to call from hot paths. */
export function ensureRelevanceProfile(force = false): Promise<ProfileRefreshResult> {
  if (!isOccuMedAwareConfigured()) {
    return Promise.resolve({ applied: false, source: getRelevanceProfile().source, missing: ["OCCU_MED_AWARE_DATABASE_URL not configured"] });
  }
  if (inflight) return inflight;
  if (!force && Date.now() - lastAttemptAt < REFRESH_TTL_MS) {
    return Promise.resolve({ applied: getRelevanceProfile().source === "neon", source: getRelevanceProfile().source, missing: [] });
  }
  lastAttemptAt = Date.now();
  inflight = refreshRelevanceProfile().finally(() => {
    inflight = null;
  });
  return inflight;
}

export { profileCompleteness };
