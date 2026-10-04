import { getRelevanceProfile, type ProfileDiscoveryCode, type RelevanceProfile } from "../search/relevanceProfile";
import { samGovDiscoveryTaxonomy } from "./samGovTaxonomy";

/**
 * A taxonomy match is positive evidence, never an exclusion boundary.
 *
 * All taxonomy codes are searched. Only classifications whose Neon discovery-code
 * fact carries `relevance_phrases` (a sufficiently direct Occu-Med service
 * relationship) receive synthetic semantic phrases; broad management/general-health
 * codes still enter discovery but must earn relevance from the actual opportunity text.
 * Codes, titles and phrases are read from the relevance profile at call time.
 */
type ClassificationKind = "naics" | "psc";

const SYSTEM_PREFIX: Record<ClassificationKind, string> = { naics: "NAICS", psc: "PSC" };

function systemMatches(entry: ProfileDiscoveryCode, kind: ClassificationKind): boolean {
  return entry.system.toUpperCase().startsWith(SYSTEM_PREFIX[kind]);
}

/** Discovery-code facts matching a code: exact facts first, then prefix families. */
function discoveryFactsFor(profile: RelevanceProfile, kind: ClassificationKind, code: string): ProfileDiscoveryCode[] {
  const upper = code.toUpperCase();
  const matches = profile.discoveryCodes.filter(
    (d) =>
      systemMatches(d, kind) &&
      d.effect.startsWith("include") &&
      (d.match === "prefix" ? upper.startsWith(d.code.toUpperCase()) : upper === d.code.toUpperCase()),
  );
  return matches.sort((a, b) => Number(a.match === "prefix") - Number(b.match === "prefix"));
}

/** Synthetic relevance phrases per classification code, derived from the profile. */
export function samGovClassificationRelevancePhrases(
  profile: RelevanceProfile = getRelevanceProfile(),
): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {};
  for (const d of profile.discoveryCodes) {
    if (d.match !== "exact" || !d.effect.startsWith("include") || d.relevancePhrases.length === 0) continue;
    if (!systemMatches(d, "naics") && !systemMatches(d, "psc")) continue;
    out[d.code.toUpperCase()] = d.relevancePhrases;
  }
  return out;
}

/**
 * Every taxonomy code is allowed to preserve a SAM candidate through the
 * pre-classification read gate. This is not an automatic relevance decision:
 * broad codes still face the downstream semantic/quality classifier.
 */
export function samGovDiscoveryClassificationCodes(
  profile: RelevanceProfile = getRelevanceProfile(),
): { naics: string[]; psc: string[] } {
  const taxonomy = samGovDiscoveryTaxonomy(profile);
  return {
    naics: taxonomy.naics.map((entry) => entry.code),
    psc: taxonomy.psc.map((entry) => entry.code),
  };
}

/**
 * Codes strong enough to contribute synthetic service evidence to semantic
 * relevance. This is deliberately narrower than the discovery taxonomy so a
 * broad classification never becomes a relevance whitelist by itself.
 */
export function samGovStrongClassificationCodes(
  profile: RelevanceProfile = getRelevanceProfile(),
): { naics: string[]; psc: string[] } {
  const phrases = samGovClassificationRelevancePhrases(profile);
  const codes = Object.keys(phrases);
  return {
    naics: codes.filter((code) => /^\d{6}$/.test(code)),
    psc: codes.filter((code) => /^[A-Z]\d{3}$/.test(code)),
  };
}

function normalizedCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code ? code : null;
}

/**
 * Build compact semantic evidence for the downstream quality/reasoning layer.
 * Unknown classifications intentionally return no evidence and no penalty.
 */
export function samGovClassificationEvidence(
  naicsCode?: string | null,
  pscCode?: string | null,
  profile: RelevanceProfile = getRelevanceProfile(),
): string[] {
  const evidence: string[] = [];
  const seen = new Set<string>();

  const append = (kind: ClassificationKind, rawCode: string | null | undefined) => {
    const code = normalizedCode(rawCode);
    if (!code) return;
    const fact = discoveryFactsFor(profile, kind, code).find((d) => d.relevancePhrases.length > 0);
    if (!fact) return;

    const text = [`${SYSTEM_PREFIX[kind]} ${code}: ${fact.title}`, ...fact.relevancePhrases].join("; ");
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
