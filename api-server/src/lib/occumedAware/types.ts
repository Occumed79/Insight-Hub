/**
 * Shared types for the OCCU_MED_AWARE reference layer.
 */

export interface AwareServiceCapability {
  capability_key: string;
  service_name: string;
  active: boolean;
  scope_role: string | null;
}

export interface AwareService {
  service_key: string;
  name: string;
  service_group: string;
  description: string | null;
  active: boolean;
}

export interface AwareRule {
  rule_key: string;
  category: string;
  title: string;
  rule_text: string;
  machine_action: string | null;
  hard_rule: boolean;
  priority: number;
  status: string;
  authority_level: string;
}

export interface AwareRfpSearchTerm {
  phrase: string;
  term_type: string;
  match_strength: string;
  target_keys: string[];
  notes: string | null;
}

export interface AwareFact {
  category: string;
  predicate: string;
  value_text: string | null;
  authority_level: string;
  status: string;
}

export interface AwareAgentPolicy {
  policy_key: string;
  applies_to: string;
  title: string;
  instruction: string;
  must_follow: boolean;
  priority: number;
}

/**
 * The merged Occu-Med reference model exposed to the rest of Insight Hub.
 *
 * Normal operation: merged from OCCU_MED_AWARE + existing static ontology.
 * Fallback (DB unavailable): static ontology values only.
 */
export interface OccuMedReferenceModel {
  /** ISO timestamp of when this model snapshot was built. */
  builtAt: string;

  /** Whether OCCU_MED_AWARE data was successfully loaded. */
  awareLoaded: boolean;

  // ── Identity ────────────────────────────────────────────────────────────
  legalName: string;
  dba: string;
  uei: string;
  cage: string;
  headquarters: string;

  // ── Scale signals (from OCCU_MED_AWARE facts) ───────────────────────────
  networkLocations: string;
  countriesCovered: string;
  employeesEvaluatedAnnually: string;
  publicSafetyClients: string;

  // ── NAICS / PSC ─────────────────────────────────────────────────────────
  primaryNaics: string;
  additionalNaics: string[];
  productServiceCodes: string[];

  // ── Capabilities ────────────────────────────────────────────────────────
  documentedCapabilities: string[];
  arrangeableCapabilities: string[];
  allActiveCapabilities: string[];

  // ── RFP search terms ────────────────────────────────────────────────────
  rfpDirectPhrases: string[];
  rfpReviewPhrases: string[];
  rfpRegulatoryRefs: string[];

  // ── Rules ───────────────────────────────────────────────────────────────
  hardRules: AwareRule[];
  allRules: AwareRule[];

  // ── Agent policies ───────────────────────────────────────────────────────
  agentPolicies: AwareAgentPolicy[];

  // ── Derived composite strings (ready for prompts) ───────────────────────
  semanticProfile: string;
  promptServiceList: string[];
  promptClientTypes: string[];
  promptCompanyContext: string;
  workersCompInstruction: string;
  imeInstruction: string;
}
