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
 * Every taxonomy code is allowed to preserve a SAM candidate through the
 * pre-classification read gate. This is not an automatic relevance decision:
 * broad codes still face the downstream semantic/quality classifier.
 */
export const SAM_GOV_DISCOVERY_CLASSIFICATION_CODES = {
  naics: SAM_GOV_DISCOVERY_TAXONOMY.naics.map((entry) => entry.code),
  psc: SAM_GOV_DISCOVERY_TAXONOMY.psc.map((entry) => entry.code),
} as const;

/**
 * Codes strong enough to contribute synthetic service evidence to semantic
 * relevance. This is deliberately narrower than the discovery taxonomy so a
 * broad classification never becomes a relevance whitelist by itself.
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
    if (phrases.length === 0) return;
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

export interface SamGovEvidenceLike {
  source?: unknown;
  providerName?: unknown;
  providerKey?: unknown;
  sourceUrl?: unknown;
  samUrl?: unknown;
  url?: unknown;
  naicsCode?: unknown;
  pscCode?: unknown;
  rawData?: unknown;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function rawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function isSamGovEvidenceRecord(record: SamGovEvidenceLike): boolean {
  const providerValues = [record.source, record.providerName, record.providerKey]
    .map(stringValue)
    .filter(Boolean)
    .map((value) => value!.toLowerCase().replace(/[^a-z]/g, ""));
  if (providerValues.includes("samgov")) return true;

  const raw = rawObject(record.rawData);
  if (stringValue(raw.providerPlatform)?.toLowerCase() === "sam.gov") return true;

  const candidateUrl = stringValue(record.samUrl) ?? stringValue(record.sourceUrl) ?? stringValue(record.url);
  if (!candidateUrl) return false;
  try {
    const host = new URL(candidateUrl).hostname.toLowerCase();
    return host === "sam.gov" || host.endsWith(".sam.gov");
  } catch {
    return false;
  }
}

/**
 * Extract strong positive classification evidence from any SAM-shaped record.
 * Unknown or broad-only classifications produce zero evidence and zero penalty.
 */
export function samGovOpportunityClassificationEvidence(
  record: SamGovEvidenceLike,
): string[] {
  if (!isSamGovEvidenceRecord(record)) return [];
  const raw = rawObject(record.rawData);
  const naicsCode = stringValue(record.naicsCode) ?? stringValue(raw.naicsCode);
  const pscCode =
    stringValue(record.pscCode) ??
    stringValue(raw.classificationCode) ??
    stringValue(raw.pscCode);
  return samGovClassificationEvidence(naicsCode, pscCode);
}
