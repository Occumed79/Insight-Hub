import { SAM_GOV_DISCOVERY_TAXONOMY } from "./samGovTaxonomy";

/**
 * A taxonomy match is positive evidence, never an exclusion boundary.
 *
 * Only high-confidence classifications receive semantic service phrases. Broad
 * management/consulting classifications still participate in SAM discovery,
 * but they do not become sufficient relevance evidence by themselves.
 */
const CLASSIFICATION_RELEVANCE_PHRASES: Readonly<Record<string, readonly string[]>> = {
  // Core occupational / medical screening classifications.
  Q403: ["occupational health", "medical evaluation", "medical screening"],
  Q533: ["occupational health services", "public health services"],
  Q701: ["medical support", "referral management", "medical evaluation"],
  Q702: ["medical readiness", "deployment medical"],
  Q801: ["medical appointment scheduling"],

  // Component services Occu-Med performs or coordinates.
  Q301: ["laboratory testing", "drug testing"],
  Q502: ["cardiology", "stress testing", "electrocardiogram"],
  Q503: ["dental examination"],
  Q509: ["medical examination", "preventive medicine"],
  Q511: ["vision examination", "optometry"],
  Q514: ["audiology", "hearing test", "hearing conservation"],
  Q515: ["laboratory testing", "phlebotomy"],
  Q517: ["vaccination", "immunization"],
  Q519: ["behavioral health evaluation", "psychiatric evaluation"],
  Q521: ["pulmonary function", "spirometry", "respiratory"],
  Q522: ["diagnostic imaging", "chest x-ray", "radiology"],

  // Health-delivery NAICS with direct Occu-Med capability correspondence.
  "621111": ["medical examination", "physician services"],
  "621210": ["dental examination"],
  "621320": ["vision examination", "optometry"],
  "621340": ["audiology", "hearing test"],
  "621399": ["medical evaluation", "fitness for duty", "drug testing"],
  "621498": ["occupational health", "outpatient medical services"],
  "621511": ["laboratory testing", "drug testing"],
  "621512": ["diagnostic imaging", "chest x-ray"],
  "621999": ["ambulatory medical services", "medical screening"],
  "923120": ["public health program"],
};

function normalizedCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code ? code : null;
}

function taxonomyEntry(kind: "naics" | "psc", code: string) {
  return SAM_GOV_DISCOVERY_TAXONOMY[kind].find((entry) => entry.code === code);
}

/**
 * Build compact semantic evidence for the downstream quality/reasoning layer.
 * Unknown classifications intentionally return no evidence and no penalty.
 */
export function samGovClassificationEvidence(
  naicsCode?: string | null,
  pscCode?: string | null,
): string[] {
  const evidence: string[] = [];
  const seen = new Set<string>();

  const append = (kind: "naics" | "psc", rawCode: string | null | undefined) => {
    const code = normalizedCode(rawCode);
    if (!code) return;
    const entry = taxonomyEntry(kind, code);
    if (!entry) return;

    const prefix = kind === "naics" ? "NAICS" : "PSC";
    const phrases = CLASSIFICATION_RELEVANCE_PHRASES[code] ?? [];
    const text = [
      `${prefix} ${entry.code}: ${entry.title}`,
      ...phrases,
    ].join("; ");
    if (!seen.has(text)) {
      seen.add(text);
      evidence.push(text);
    }
  };

  append("naics", naicsCode);
  append("psc", pscCode);
  return evidence;
}
