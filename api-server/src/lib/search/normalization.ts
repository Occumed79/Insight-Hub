import type { NormalizedOpportunity } from "../providers/types";
import type { InsertOpportunity, ProviderKey } from "@workspace/db/schema";
import { normalizeOpportunityEvidence } from "../opportunityEvidence";

/**
 * Maps every provider name that can appear on a NormalizedOpportunity to a
 * canonical ProviderKey stored in the provider_key DB column.
 *
 * The provider_key is the primary identity scope used for duplicate detection
 * together with notice_id. It is intentionally more granular than the broad
 * three-value source enum, which is kept separately for display/category use.
 */
const PROVIDER_KEY_MAP: Record<string, ProviderKey> = {
  samGov: "samGov",
  texasEsbd: "texasEsbd",
  nyScr: "nyScr",
  statePortals: "publicPortalProviders", // retired alias for the unified public-portal provider
  publicPortalProviders: "publicPortalProviders",
  eunaBonfire: "eunaBonfire",
  internationalPublicPortals: "internationalPublicPortals",
  tango: "tango",
  bidnet: "bidnet",
  serper: "serper",
  tavily: "tavily",
  exa: "exa",
  gemini: "gemini",
  firecrawl: "manual",
  openrouter: "manual",
  groq: "manual",
  browseAi: "manual",
  browserUse: "manual",
  olostep: "manual",
  clod: "manual",
  jina: "manual",
  minimax: "manual",
  you: "manual",
  langsearch: "manual",
  websearch: "manual",
  cerebras: "manual",
  cohere: "manual",
  deepseek: "manual",
  mistral: "manual",
  nvidia: "manual",
  cloudflareWorker: "manual",
};

/**
 * Convert a NormalizedOpportunity into a DB record for storage.
 * The primary `id` is intentionally excluded — callers are responsible for
 * assigning a stable UUID at INSERT time or omitting it on UPDATE so an
 * existing row's primary key is never overwritten.
 *
 * Web-sourced records are stored with source = manual unless they map to an
 * explicit first-party source bucket in the current RFP schema.
 */
export function normalizedToDbRecord(
  record: NormalizedOpportunity,
): Omit<InsertOpportunity, "id"> {
  const sourceMap: Record<string, "sam_gov" | "csv_import" | "manual"> = {
    samGov: "sam_gov",
    texasEsbd: "csv_import",
    nyScr: "csv_import",
    statePortals: "csv_import",
    gemini: "manual",
    serper: "manual",
    tavily: "manual",
    tango: "manual",
    bidnet: "manual",
  };

  const rawData = record.rawData ?? {};
  const evidence = normalizeOpportunityEvidence(record);
  const relevanceScore = rawData.relevanceScore as number | undefined;
  const relevanceReason = rawData.relevanceReason as string | undefined;
  const isFallback = rawData.fallback === true;
  const tagList = Array.isArray(rawData.tags) ? (rawData.tags as string[]) : [];
  const providerName =
    typeof rawData.providerName === "string" && rawData.providerName.trim()
      ? rawData.providerName.trim()
      : record.source;
  const notes =
    typeof rawData.notes === "string" && rawData.notes.trim()
      ? rawData.notes.trim()
      : relevanceReason;
  const rawConfidence =
    typeof rawData.sourceConfidence === "string"
      ? rawData.sourceConfidence
      : null;
  const confidenceRank = { low: 0, medium: 1, high: 2 } as const;
  const normalizedRawConfidence =
    rawConfidence === "high" ||
    rawConfidence === "medium" ||
    rawConfidence === "low"
      ? rawConfidence
      : null;
  const sourceConfidence =
    normalizedRawConfidence &&
    confidenceRank[normalizedRawConfidence] <
      confidenceRank[evidence.sourceConfidence]
      ? normalizedRawConfidence
      : evidence.sourceConfidence;

  return {
    noticeId: record.externalId || undefined,
    title: record.title,
    agency: record.agency,
    subAgency: record.subAgency ?? null,
    office: null,
    type: record.type,
    // Deadline-based archival is reconciled explicitly after a manual run or
    // through POST /opportunities/reconcile-expired.
    status: record.status,
    naicsCode: record.naicsCode ?? null,
    naicsDescription: record.naicsDescription ?? null,
    pscCode: null,
    contractType: null,
    postedDate: record.postedDate,
    responseDeadline: record.responseDeadline ?? null,
    periodOfPerformance: null,
    setAside: record.setAside ?? null,
    placeOfPerformance: record.placeOfPerformance ?? null,
    description: record.description ?? null,
    solicitationNumber: record.solicitationNumber ?? null,
    samUrl: record.sourceUrl ?? null,
    estimatedValue:
      record.estimatedValue != null ? String(record.estimatedValue) : null,
    ceilingValue: null,
    floorValue: null,
    awardAmount: record.awardAmount != null ? String(record.awardAmount) : null,
    awardee: record.awardee ?? null,
    source: sourceMap[record.source] ?? "manual",
    providerKey: PROVIDER_KEY_MAP[record.source] ?? "manual",
    providerName,
    relevanceScore: relevanceScore != null ? String(relevanceScore) : null,
    sourceConfidence,
    tags: JSON.stringify(
      Array.from(
        new Set([
          ...tagList.filter((tag) => !tag.startsWith("evidence:")),
          ...evidence.tags,
        ]),
      ),
    ),
    notes:
      [
        isFallback
          ? "Official portal discovery — parser enrichment pending."
          : null,
        evidence.notes,
        notes,
      ]
        .filter(Boolean)
        .join(" ") || null,
  };
}
