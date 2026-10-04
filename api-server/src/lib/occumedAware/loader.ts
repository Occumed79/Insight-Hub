/**
 * OCCU_MED_AWARE reference loader.
 * Builds the merged OccuMedReferenceModel. Identity / scale / registration values fall back to static company
 * facts when the DB is unreachable; every service, buyer-type and scope-instruction value is derived from the
 * relevance profile (live Neon profile, or its snapshot), never from vocabulary kept in this file.
 */

import type { AwareAgentPolicy, AwareRule, AwareRfpSearchTerm, OccuMedReferenceModel } from "./types";
import { isOccuMedAwareConfigured, queryOccuMedAware } from "./db";
import { getRelevanceProfile, type RelevanceProfile } from "../search/relevanceProfile";

// ── Static fallback values ─────────────────────────────────────────────────────

const STATIC_IDENTITY = {
  legalName: "OCCU-MED, LTD.",
  dba: "OCCU-MED",
  uei: "MF2FNN9FF7B3",
  cage: "4W7A0",
  headquarters: "2121 W Bullard Ave, Fresno, CA 93711-1258, United States",
};

const STATIC_SCALE = {
  networkLocations: "15,000+ medical and dental facilities",
  countriesCovered: "50+ countries",
  employeesEvaluatedAnnually: "More than one million employees annually",
  publicSafetyClients: "500+ public safety clients",
};

const STATIC_NAICS = {
  primaryNaics: "541612",
  additionalNaics: ["541611", "541614", "621111", "621498", "621999", "923120"],
  productServiceCodes: ["Q403", "Q999"],
};

// ── Profile builders ───────────────────────────────────────────────────────────

/** Primary (non-adjacent) service-line labels of the profile: the one list of what Occu-Med sells. */
function profileServiceLines(profile: RelevanceProfile): string[] {
  return profile.categories.filter((c) => !c.adjacentOnly).map((c) => c.label);
}

function buildSemanticProfile(services: string[], profile: RelevanceProfile): string {
  const lines = profileServiceLines(profile);
  return (
    `Open government solicitation or RFP for ${STATIC_IDENTITY.dba} services including: ${services.slice(0, 8).join(", ")}. ` +
    `Service lines: ${lines.join("; ")}. ` +
    `Includes federal, state, local, and international procurement opportunities.`
  );
}

function buildPromptCompanyContext(services: string[]): string {
  return (
    `Occu-Med (legal name: ${STATIC_IDENTITY.legalName}, UEI: ${STATIC_IDENTITY.uei}, CAGE: ${STATIC_IDENTITY.cage}) ` +
    `is an occupational health and medical exam coordination company headquartered in Fresno, CA. ` +
    `They operate a network of ${STATIC_SCALE.networkLocations} across ${STATIC_SCALE.countriesCovered} and ` +
    `evaluate ${STATIC_SCALE.employeesEvaluatedAnnually}. They serve ${STATIC_SCALE.publicSafetyClients}. ` +
    `Core services: ${services.slice(0, 10).join("; ")}.`
  );
}

// ── Main loader ────────────────────────────────────────────────────────────────

async function loadFromAware(): Promise<Partial<OccuMedReferenceModel> & { serviceNames?: string[] }> {
  const [caps, services, rules, policies, terms, facts] = await Promise.all([
    queryOccuMedAware<{ capability_key: string; service_name: string; active: boolean; scope_role: string | null }>(
      `SELECT capability_key, service_name, active, scope_role FROM occumed_core.service_capabilities ORDER BY scope_role, service_name`,
    ),
    queryOccuMedAware<{ service_key: string; name: string; service_group: string; description: string | null; active: boolean }>(
      `SELECT service_key, name, service_group, description, active FROM occumed_core.services WHERE active = true ORDER BY name`,
    ),
    queryOccuMedAware<AwareRule>(
      `SELECT rule_key, category, title, rule_text, machine_action, hard_rule, priority, status, authority_level FROM occumed_core.v_current_rules ORDER BY hard_rule DESC, priority DESC`,
    ),
    queryOccuMedAware<AwareAgentPolicy>(
      `SELECT policy_key, applies_to, title, instruction, must_follow, priority FROM occumed_core.agent_policies WHERE active = true ORDER BY priority DESC`,
    ),
    queryOccuMedAware<AwareRfpSearchTerm>(
      `SELECT phrase, term_type, match_strength, target_keys, notes FROM occumed_core.rfp_search_terms WHERE active = true ORDER BY term_type, phrase`,
    ),
    queryOccuMedAware<{ category: string; predicate: string; value_text: string | null; authority_level: string; status: string }>(
      `SELECT category, predicate, value_text, authority_level, status FROM occumed_core.v_current_facts WHERE subject_entity_id = 1 ORDER BY category, predicate`,
    ),
  ]);

  const factMap = new Map(facts.map((f) => [`${f.category}/${f.predicate}`, f.value_text]));

  const identity = {
    legalName: factMap.get("identity/legal_name") ?? STATIC_IDENTITY.legalName,
    dba: factMap.get("identity/doing_business_as") ?? STATIC_IDENTITY.dba,
    uei: factMap.get("identity/uei") ?? STATIC_IDENTITY.uei,
    cage: factMap.get("identity/cage") ?? STATIC_IDENTITY.cage,
    headquarters: factMap.get("identity/headquarters") ?? STATIC_IDENTITY.headquarters,
  };

  const scale = {
    networkLocations: factMap.get("network/network_locations") ?? STATIC_SCALE.networkLocations,
    countriesCovered: factMap.get("network/countries_covered") ?? STATIC_SCALE.countriesCovered,
    employeesEvaluatedAnnually: factMap.get("scale/employees_evaluated_annually") ?? STATIC_SCALE.employeesEvaluatedAnnually,
    publicSafetyClients: factMap.get("scale/public_safety_clients") ?? STATIC_SCALE.publicSafetyClients,
  };

  const primaryNaicsRaw = factMap.get("federal_registration/primary_naics") ?? "";
  const primaryNaics = primaryNaicsRaw.split(" ")[0] ?? STATIC_NAICS.primaryNaics;
  const additionalNaicsRaw = factMap.get("federal_registration/additional_naics") ?? "";
  const additionalNaics = additionalNaicsRaw
    ? additionalNaicsRaw.split(/[;,\s]+/).map((s) => s.trim()).filter(Boolean)
    : STATIC_NAICS.additionalNaics;
  const pscRaw = factMap.get("federal_registration/product_service_codes") ?? "";
  const productServiceCodes = pscRaw
    ? pscRaw.split(/[;,\s]+/).map((s) => s.trim()).filter((s) => /^[A-Z]\d/.test(s))
    : STATIC_NAICS.productServiceCodes;

  const activeCaps = caps.filter((c) => c.active);
  const documentedCapabilities = activeCaps.filter((c) => c.scope_role === "documented_baseline").map((c) => c.service_name);
  const arrangeableCapabilities = activeCaps.filter((c) => c.scope_role === "arrangeable").map((c) => c.service_name);
  const allActiveCapabilities = activeCaps.map((c) => c.service_name);

  const rfpDirectPhrases = terms.filter((t) => t.term_type === "procurement_phrase" && t.match_strength === "direct").map((t) => t.phrase);
  const rfpReviewPhrases = terms.filter((t) => t.term_type === "procurement_phrase" && t.match_strength === "review").map((t) => t.phrase);
  const rfpRegulatoryRefs = terms.filter((t) => t.term_type === "regulatory_reference" || t.term_type === "standard_reference").map((t) => t.phrase);

  const serviceNames = Array.from(new Set([...services.map((s) => s.name), ...documentedCapabilities.slice(0, 20)])).slice(0, 18);

  return {
    ...identity,
    ...scale,
    primaryNaics,
    additionalNaics,
    productServiceCodes,
    documentedCapabilities,
    arrangeableCapabilities,
    allActiveCapabilities,
    rfpDirectPhrases,
    rfpReviewPhrases,
    rfpRegulatoryRefs,
    hardRules: rules.filter((r) => r.hard_rule),
    allRules: rules,
    agentPolicies: policies,
    serviceNames,
  };
}

// Neon rule / policy identifiers that carry the workers' compensation and IME scope text.
const WORKERS_COMP_RULE_KEY = "workers_comp_excluded";
const IME_POLICY_KEYS = ["interpret_ime_as_employment_fitness_only", "ime_requires_employment_context"];

/** Prompt strings derived from the relevance profile; `neonServices` only overrides the service list. */
function profileDerived(profile: RelevanceProfile, neonServices: string[]) {
  const lines = profileServiceLines(profile);
  const promptServiceList = neonServices.length > 0 ? neonServices : lines;
  const workersComp = profile.rules.find((r) => r.key === WORKERS_COMP_RULE_KEY);
  const imePolicy = IME_POLICY_KEYS.map((k) => profile.policies.find((p) => p.policy_key === k)).find(Boolean);
  return {
    semanticProfile: buildSemanticProfile(promptServiceList, profile),
    promptServiceList,
    promptClientTypes: profile.targetBuyerTypes,
    promptCompanyContext: buildPromptCompanyContext(promptServiceList),
    workersCompInstruction: workersComp?.text ?? "",
    imeInstruction: imePolicy?.instruction ?? "",
  };
}

function staticFallback(): OccuMedReferenceModel {
  return {
    builtAt: new Date().toISOString(),
    awareLoaded: false,
    ...STATIC_IDENTITY,
    ...STATIC_SCALE,
    ...STATIC_NAICS,
    documentedCapabilities: [],
    arrangeableCapabilities: [],
    allActiveCapabilities: [],
    rfpDirectPhrases: [],
    rfpReviewPhrases: [],
    rfpRegulatoryRefs: [],
    hardRules: [],
    allRules: [],
    agentPolicies: [],
    ...profileDerived(getRelevanceProfile(), []),
  };
}

export async function buildOccuMedReferenceModel(): Promise<OccuMedReferenceModel> {
  if (!isOccuMedAwareConfigured()) return staticFallback();
  try {
    // The relevance profile rides the same refresh cycle as the reference model, and the prompt strings
    // below are derived from it, so it is refreshed before they are built.
    const [aware] = await Promise.all([
      loadFromAware(),
      import("./relevanceProfileLoader").then((m) => m.ensureRelevanceProfile()).catch(() => undefined),
    ]);
    const derived = profileDerived(getRelevanceProfile(), aware.serviceNames ?? []);
    return {
      builtAt: new Date().toISOString(),
      awareLoaded: true,
      legalName: aware.legalName ?? STATIC_IDENTITY.legalName,
      dba: aware.dba ?? STATIC_IDENTITY.dba,
      uei: aware.uei ?? STATIC_IDENTITY.uei,
      cage: aware.cage ?? STATIC_IDENTITY.cage,
      headquarters: aware.headquarters ?? STATIC_IDENTITY.headquarters,
      networkLocations: aware.networkLocations ?? STATIC_SCALE.networkLocations,
      countriesCovered: aware.countriesCovered ?? STATIC_SCALE.countriesCovered,
      employeesEvaluatedAnnually: aware.employeesEvaluatedAnnually ?? STATIC_SCALE.employeesEvaluatedAnnually,
      publicSafetyClients: aware.publicSafetyClients ?? STATIC_SCALE.publicSafetyClients,
      primaryNaics: aware.primaryNaics ?? STATIC_NAICS.primaryNaics,
      additionalNaics: aware.additionalNaics ?? STATIC_NAICS.additionalNaics,
      productServiceCodes: aware.productServiceCodes ?? STATIC_NAICS.productServiceCodes,
      documentedCapabilities: aware.documentedCapabilities ?? [],
      arrangeableCapabilities: aware.arrangeableCapabilities ?? [],
      allActiveCapabilities: aware.allActiveCapabilities ?? [],
      rfpDirectPhrases: aware.rfpDirectPhrases ?? [],
      rfpReviewPhrases: aware.rfpReviewPhrases ?? [],
      rfpRegulatoryRefs: aware.rfpRegulatoryRefs ?? [],
      hardRules: aware.hardRules ?? [],
      allRules: aware.allRules ?? [],
      agentPolicies: aware.agentPolicies ?? [],
      ...derived,
    };
  } catch (error) {
    console.warn(JSON.stringify({
      event: "occu_med_aware_load_failed",
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
      fallback: true,
    }));
    return staticFallback();
  }
}
