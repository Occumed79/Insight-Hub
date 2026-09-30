/**
 * OCCU_MED_AWARE reference loader.
 * Builds the merged OccuMedReferenceModel. Falls back to static ontology on DB failure.
 */

import type { AwareAgentPolicy, AwareRule, AwareRfpSearchTerm, OccuMedReferenceModel } from "./types";
import { isOccuMedAwareConfigured, queryOccuMedAware } from "./db";

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

export const STATIC_SERVICES = [
  "Pre-placement / pre-employment physical examinations and medical evaluations (EXAMQA)",
  "Deployment medical readiness and pre/post-deployment health assessments",
  "Fitness-for-duty and return-to-work evaluations (employment-related IME — NOT workers comp claims)",
  "Periodic medical evaluations and surveillance (HAZWOPER, lead, asbestos, silica, hearing conservation, respirator)",
  "DOT physicals and FMCSA medical examinations",
  "DOT and non-DOT drug and alcohol testing (urine and oral fluid)",
  "Respirator medical evaluations, clearance, and OSHA fit testing (qualitative and quantitative)",
  "Audiometric testing and hearing conservation programs",
  "Pulmonary function testing / spirometry",
  "Immunizations and travel medicine (deployment and international assignments)",
  "Embassy and visa medical clearance examinations",
  "Psychological assessments",
  "Public-safety medical services (NFPA 1582 firefighter physicals, law enforcement POST exams, CDL/DOT physicals)",
  "Provider network and program management (15,000+ facilities, nationwide and international)",
];

const STATIC_CLIENT_TYPES = [
  "Federal agencies and federal contractors (including defense/OCONUS deployments)",
  "State, local, and municipal governments (public safety agencies, utilities, transit authorities)",
  "Industrial, manufacturing, and construction employers",
  "DOT-regulated carriers and commercial vehicle fleets",
  "Public safety agencies (police, fire, EMS, corrections)",
  "Healthcare organizations",
  "Schools, universities, and special districts",
];

const STATIC_WORKERS_COMP_INSTRUCTION =
  "Workers' compensation treatment, claims administration, MPN/provider-panel enrollment, " +
  "utilization review, and managed care are EXCLUDED from Occu-Med's service scope. " +
  "However, do NOT auto-reject an RFP solely because it mentions workers' compensation. " +
  "If an RFP includes workers' comp language alongside genuine Occu-Med-relevant services " +
  "(e.g., pre-employment exams, drug testing, DOT physicals, medical surveillance), treat it as " +
  "relevant but flag the workers' comp component as out-of-scope.";

const STATIC_IME_INSTRUCTION =
  "Occu-Med performs employment-related Independent Medical Evaluations (IME) to determine " +
  "whether an employee can safely return to work, continue working, or perform required job duties. " +
  "This is fitness-for-duty work, NOT workers' compensation impairment or benefit determination. " +
  "IME / fitness-for-duty / return-to-work evaluations are IN SCOPE. Do not reject opportunities " +
  "containing 'independent medical examination' or 'IME' without confirming the context is " +
  "workers' comp benefit/claim determination rather than employment fitness-for-duty.";

// ── Profile builders ───────────────────────────────────────────────────────────

function buildSemanticProfile(services: string[]): string {
  const top = services.slice(0, 8).join(", ");
  return (
    `Open government solicitation or RFP for occupational health and medical examination services including: ${top}. ` +
    `Includes federal, state, local, and international procurement opportunities for DOT physicals, ` +
    `drug and alcohol testing, audiometry, respirator clearance, pulmonary function testing, ` +
    `medical surveillance, deployment medical readiness, immunizations, and provider-network program management.`
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

async function loadFromAware(): Promise<Partial<OccuMedReferenceModel>> {
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

  const wcRule = rules.find((r) => r.rule_key === "workers_comp_excluded");
  const workersCompInstruction = wcRule
    ? `${wcRule.rule_text} IMPORTANT: Do not auto-reject an RFP solely because it mentions workers' compensation. If an RFP includes workers' comp language alongside Occu-Med-relevant services, treat it as relevant but flag the workers' comp component as out-of-scope.`
    : STATIC_WORKERS_COMP_INSTRUCTION;

  const imePolicy = policies.find((p) =>
    p.policy_key === "interpret_ime_as_employment_fitness_only" || p.policy_key === "ime_requires_employment_context",
  );
  const imeInstruction = imePolicy ? imePolicy.instruction : STATIC_IME_INSTRUCTION;

  const serviceNames = Array.from(new Set([...services.map((s) => s.name), ...documentedCapabilities.slice(0, 20)])).slice(0, 18);
  const promptServiceList = serviceNames.length > 0 ? serviceNames : STATIC_SERVICES;
  const semanticProfile = buildSemanticProfile(promptServiceList);
  const promptCompanyContext = buildPromptCompanyContext(promptServiceList);

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
    semanticProfile,
    promptServiceList,
    promptClientTypes: STATIC_CLIENT_TYPES,
    promptCompanyContext,
    workersCompInstruction,
    imeInstruction,
  };
}

function staticFallback(): OccuMedReferenceModel {
  const semanticProfile = buildSemanticProfile(STATIC_SERVICES);
  const promptCompanyContext = buildPromptCompanyContext(STATIC_SERVICES);
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
    semanticProfile,
    promptServiceList: STATIC_SERVICES,
    promptClientTypes: STATIC_CLIENT_TYPES,
    promptCompanyContext,
    workersCompInstruction: STATIC_WORKERS_COMP_INSTRUCTION,
    imeInstruction: STATIC_IME_INSTRUCTION,
  };
}

export async function buildOccuMedReferenceModel(): Promise<OccuMedReferenceModel> {
  if (!isOccuMedAwareConfigured()) return staticFallback();
  try {
    const aware = await loadFromAware();
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
      semanticProfile: aware.semanticProfile ?? buildSemanticProfile(STATIC_SERVICES),
      promptServiceList: aware.promptServiceList ?? STATIC_SERVICES,
      promptClientTypes: aware.promptClientTypes ?? STATIC_CLIENT_TYPES,
      promptCompanyContext: aware.promptCompanyContext ?? buildPromptCompanyContext(STATIC_SERVICES),
      workersCompInstruction: aware.workersCompInstruction ?? STATIC_WORKERS_COMP_INSTRUCTION,
      imeInstruction: aware.imeInstruction ?? STATIC_IME_INSTRUCTION,
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
