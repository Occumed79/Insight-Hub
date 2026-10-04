/**
 * The Occu-Med relevance profile.
 *
 * ONE definition of what is relevant, built from the OCCU_MED_AWARE (Neon) reference rows:
 *   - rfp_search_terms  -> service categories, evidence terms, signals
 *   - rules             -> hard rejects, scope rules, conditional penalties, program combinations
 *   - facts             -> category definitions, canonical thresholds, discovery codes, bundles
 *   - agent_policies    -> judge/extract instructions
 *
 * `buildProfile` is a pure function of those rows (no caps, no embedded vocabulary), so the same
 * rows always give the same profile. The classifier, decision layer, providers and prompts all read it.
 *
 * Fallback: if the live Neon profile is missing or incomplete, a snapshot generated from the migration
 * files is used and every result carries `source: "snapshot"`. The snapshot is data, not a second source
 * of truth, and is retired once the Neon profile is active.
 */
import { SNAPSHOT_ROWS } from "./relevanceProfile.snapshot.generated";

export interface ProfileTermRow {
  phrase: string;
  term_type: string;
  match_strength: string;
  target_keys: string[] | null;
  metadata: Record<string, unknown> | null;
}
export interface ProfileRuleRow {
  rule_key: string;
  category: string;
  title: string;
  rule_text: string;
  machine_action: string | null;
  hard_rule: boolean;
  priority: number;
  scope: Record<string, unknown> | null;
  search_triggers: string[] | null;
}
export interface ProfileFactRow {
  fact_key: string;
  category: string;
  predicate: string;
  value_text: string | null;
  value_json: unknown;
  value_numeric: number | string | null;
}
export interface ProfilePolicyRow {
  policy_key: string;
  applies_to: string;
  title: string;
  instruction: string;
  priority: number;
  must_follow: boolean;
}
export interface ProfileRows {
  terms: ProfileTermRow[];
  rules: ProfileRuleRow[];
  facts: ProfileFactRow[];
  policies: ProfilePolicyRow[];
}

export interface ProfileCategory {
  id: string;
  label: string;
  adjacentOnly: boolean;
  explicit: string[];
  component: string[];
  regulatory: string[];
}
export interface ProfileRule {
  key: string;
  title: string;
  action: string;
  hard: boolean;
  priority: number;
  scope: Record<string, unknown>;
  triggers: string[];
}
export interface ProfileDiscoveryCode {
  system: string;
  code: string;
  match: "exact" | "prefix";
  tier: string;
  effect: string;
  title: string;
  relevancePhrases: string[];
}
export interface ProfileSearchBundle {
  key: string;
  label: string;
  serviceTerms: string[];
  workforceTerms: string[];
  procurementTerms: string[];
  exclusions: string[];
}
export interface RelevanceProfile {
  source: "neon" | "snapshot";
  categories: ProfileCategory[];
  /** Direct phrases that are evidence of a relevant procurement but belong to no named category. */
  generalExplicit: string[];
  /** Regulatory/standard references not tied to a category. */
  regulatory: string[];
  procurementSignals: string[];
  workforceSignals: string[];
  networkTerms: string[];
  /** Id of the category that represents provider-network / program-management scope. */
  networkCategoryId: string | null;
  titleMedical: string[];
  genericTitle: string[];
  /** Buyer-sector and prime-contractor signals (all treated as prime/buyer signals by the classifier). */
  prime: string[];
  buyerSectors: Array<{ phrase: string; propensity: string | null }>;
  rules: ProfileRule[];
  thresholds: { acceptMin: number; reviewMin: number };
  discoveryCodes: ProfileDiscoveryCode[];
  searchBundles: ProfileSearchBundle[];
  targetBuyerTypes: string[];
  /** Per-phrase GovCon weights kept as term metadata. */
  govconWeights: Record<string, number>;
  policies: ProfilePolicyRow[];
  /** Every term a title can name to rescue a scope rule: all category evidence terms. */
  allServiceTerms: string[];
}

const low = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();
const dedupe = (a: string[]): string[] => Array.from(new Set(a)).sort();
const meta = (t: ProfileTermRow): Record<string, unknown> => (t.metadata ?? {}) as Record<string, unknown>;

function termCategory(t: ProfileTermRow): string | null {
  const m = meta(t).category;
  if (typeof m === "string" && m) return m;
  const key = (t.target_keys ?? []).find((k) => k.startsWith("category:"));
  return key ? key.slice("category:".length) : null;
}
function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Pure: rows in, profile out. */
export function buildProfile(rows: ProfileRows, source: "neon" | "snapshot" = "neon"): RelevanceProfile {
  const categories = new Map<string, ProfileCategory>();
  for (const f of rows.facts) {
    if (f.category !== "relevance_category") continue;
    const j = (f.value_json ?? {}) as Record<string, unknown>;
    categories.set(f.predicate, {
      id: f.predicate,
      label: f.value_text ?? f.predicate,
      adjacentOnly: j.adjacent_only === true,
      explicit: [],
      component: [],
      regulatory: [],
    });
  }
  const p: RelevanceProfile = {
    source,
    categories: [],
    generalExplicit: [],
    regulatory: [],
    procurementSignals: [],
    workforceSignals: [],
    networkTerms: [],
    networkCategoryId: null,
    titleMedical: [],
    genericTitle: [],
    prime: [],
    buyerSectors: [],
    rules: [],
    thresholds: { acceptMin: NaN, reviewMin: NaN },
    discoveryCodes: [],
    searchBundles: [],
    targetBuyerTypes: [],
    govconWeights: {},
    policies: rows.policies,
    allServiceTerms: [],
  };
  for (const t of rows.terms) {
    const phrase = low(t.phrase);
    if (!phrase) continue;
    const cat = termCategory(t);
    const gw = num(meta(t).govcon_weight as number | undefined);
    if (gw !== null) p.govconWeights[phrase] = Math.max(p.govconWeights[phrase] ?? 0, gw);
    switch (t.term_type) {
      case "procurement_stage_signal":
        p.procurementSignals.push(phrase);
        continue;
      case "workforce_signal":
        p.workforceSignals.push(phrase);
        continue;
      case "delivery_network_term":
        p.networkTerms.push(phrase);
        if (cat && !p.networkCategoryId) p.networkCategoryId = cat;
        continue;
      case "title_signal":
        (meta(t).role === "generic_title_scope" ? p.genericTitle : p.titleMedical).push(phrase);
        continue;
      case "buyer_sector_signal":
        p.prime.push(phrase);
        p.buyerSectors.push({ phrase, propensity: typeof meta(t).propensity === "string" ? (meta(t).propensity as string) : null });
        continue;
    }
    const c = cat ? categories.get(cat) : undefined;
    if (c) {
      if (t.term_type === "procurement_phrase" && t.match_strength === "direct") c.explicit.push(phrase);
      else if (t.term_type === "regulatory_reference") c.regulatory.push(phrase);
      else c.component.push(phrase);
    } else if (t.term_type === "regulatory_reference" || t.term_type === "standard_reference") {
      p.regulatory.push(phrase);
    } else if (t.term_type === "procurement_phrase" && t.match_strength === "direct") {
      // Curated direct evidence outside any named category. Very short phrases are too ambiguous to stand alone.
      if (phrase.length >= 8) p.generalExplicit.push(phrase);
    }
    // review-strength terms with no category carry no evidence on their own
  }
  for (const c of categories.values()) {
    c.explicit = dedupe(c.explicit);
    c.component = dedupe(c.component);
    c.regulatory = dedupe(c.regulatory);
  }
  p.categories = [...categories.values()];
  p.generalExplicit = dedupe(p.generalExplicit);
  p.regulatory = dedupe(p.regulatory);
  p.procurementSignals = dedupe(p.procurementSignals);
  p.workforceSignals = dedupe(p.workforceSignals);
  p.networkTerms = dedupe(p.networkTerms);
  p.titleMedical = dedupe(p.titleMedical);
  p.genericTitle = dedupe(p.genericTitle);
  p.prime = dedupe(p.prime);
  p.allServiceTerms = dedupe(p.categories.flatMap((c) => [...c.explicit, ...c.component, ...c.regulatory]));

  p.rules = rows.rules
    .map((r) => ({
      key: r.rule_key,
      title: r.title,
      action: r.machine_action ?? "",
      hard: r.hard_rule,
      priority: r.priority,
      scope: (r.scope ?? {}) as Record<string, unknown>,
      triggers: (r.search_triggers ?? []).map(low).filter(Boolean),
    }))
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));

  for (const f of rows.facts) {
    const j = (f.value_json ?? null) as Record<string, any> | null;
    switch (f.category) {
      case "relevance_threshold": {
        const n = num(f.value_numeric);
        if (n === null) break;
        if (f.predicate === "relevance.accept_min") p.thresholds.acceptMin = n;
        if (f.predicate === "relevance.review_min") p.thresholds.reviewMin = n;
        break;
      }
      case "rfp_discovery_code":
        if (j && typeof j.code === "string")
          p.discoveryCodes.push({
            system: String(j.system ?? ""),
            code: j.code,
            match: j.match === "prefix" ? "prefix" : "exact",
            tier: String(j.tier ?? ""),
            effect: String(j.effect ?? ""),
            title: String(j.title ?? ""),
            relevancePhrases: strings(j.relevance_phrases).map(low),
          });
        break;
      case "rfp_search_bundle":
        if (j)
          p.searchBundles.push({
            key: f.predicate,
            label: f.value_text ?? f.predicate,
            serviceTerms: strings(j.service_terms),
            workforceTerms: strings(j.workforce_terms),
            procurementTerms: strings(j.procurement_terms),
            exclusions: strings(j.exclusions),
          });
        break;
      case "target_buyer_type":
        p.targetBuyerTypes.push(...strings(f.value_json));
        break;
    }
  }
  return p;
}

/**
 * A profile is complete when it can make every decision the classifier needs. An incomplete profile is
 * never used silently: the caller falls back to the snapshot and marks results accordingly.
 */
export function profileCompleteness(p: RelevanceProfile): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  if (p.categories.length === 0 || p.categories.every((c) => c.explicit.length === 0)) missing.push("service categories with explicit phrases");
  if (p.procurementSignals.length === 0) missing.push("procurement signals");
  if (p.titleMedical.length === 0) missing.push("title signals");
  if (!p.networkCategoryId) missing.push("network category");
  if (!Number.isFinite(p.thresholds.acceptMin) || !Number.isFinite(p.thresholds.reviewMin)) missing.push("canonical thresholds");
  if (p.thresholds.reviewMin > p.thresholds.acceptMin) missing.push("thresholds ordered review_min <= accept_min");
  if (!p.rules.some((r) => r.hard)) missing.push("hard rules");
  if (!p.rules.some((r) => r.action === "accept_program_combination")) missing.push("program combinations");
  if (!p.rules.some((r) => r.action === "network_requires_service_evidence")) missing.push("network service-evidence rule");
  return { complete: missing.length === 0, missing };
}

let snapshotProfile: RelevanceProfile | null = null;
export function snapshotRelevanceProfile(): RelevanceProfile {
  if (!snapshotProfile) snapshotProfile = buildProfile(SNAPSHOT_ROWS, "snapshot");
  return snapshotProfile;
}

let current: RelevanceProfile | null = null;
/** The profile every relevance decision reads. Falls back to the snapshot until a live profile is set. */
export function getRelevanceProfile(): RelevanceProfile {
  return current ?? snapshotRelevanceProfile();
}
/** Publish a profile. Rejects (returns false) an incomplete one so a half-loaded Neon profile never takes effect. */
export function setRelevanceProfile(profile: RelevanceProfile | null): { applied: boolean; missing: string[] } {
  if (!profile) {
    current = null;
    return { applied: false, missing: ["no profile"] };
  }
  const { complete, missing } = profileCompleteness(profile);
  if (!complete) return { applied: false, missing };
  current = profile;
  return { applied: true, missing: [] };
}
