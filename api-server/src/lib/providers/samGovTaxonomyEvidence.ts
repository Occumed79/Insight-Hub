import { SAM_GOV_DISCOVERY_TAXONOMY } from "./samGovTaxonomy";

/**
 * A taxonomy match is positive evidence, never an exclusion boundary.
 *
 * All taxonomy codes are searched. Only classifications with a sufficiently
 * direct Occu-Med service relationship receive synthetic semantic phrases;
 * broad management/general-health codes still enter discovery but must earn
 * relevance from the actual opportunity text.
 */
const CLASSIFICATION_RELEVANCE_PHRASES: Readonly<Record<string, readonly string[]>> = {
  // Core occupational / medical screening classifications.
  Q403: ["occupational health", "medical evaluation", "medical screening"],
  Q533: ["occupational health services", "public health services"],
  Q701: ["medical support", "referral management", "medical evaluation"],
  Q702: ["medical readiness", "deployment medical"],
  Q801: ["medical appointment scheduling"],

  // Component services Occu-Med directly performs or coordinates.
  Q301: ["laboratory testing"],
  Q503: ["dental examination"],
  Q511: ["vision examination", "optometry"],
  Q514: ["audiology", "hearing test", "hearing conservation"],
  Q515: ["laboratory testing"],
  Q521: ["pulmonary function", "spirometry"],
  Q522: ["diagnostic imaging", "chest x-ray", "radiology"],

  // Narrower health-delivery NAICS with direct service correspondence.
  "621210": ["dental examination"],
  "621320": ["vision examination", "optometry"],
  "621340": ["audiology", "hearing test"],
  "621511": ["laboratory testing"],
  "621512": ["diagnostic imaging", "chest x-ray"],
};

const classificationEvidenceCodes = Object.keys(CLASSIFICATION_RELEVANCE_PHRASES);

/**
 * Codes strong enough to preserve a candidate through the legacy read-time
 * service-text gate. This is deliberately narrower than the full discovery
 * taxonomy so broad codes never become an automatic relevance whitelist.
 */
export const SAM_GOV_STRONG_CLASSIFICATION_CODES = {
  naics: classificationEvidenceCodes.filter((code) => /^\d{6}$/.test(code)),
  psc: classificationEvidenceCodes.filter((code) => /^[A-Z]\d{3}$/.test(code)),
} as const;

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
