import { createHash } from "node:crypto";
import type { NormalizedOpportunity } from "../providers/types";
import { passesQualityFilter } from "../search/relevance";
import { normalizedToDbRecord } from "../search/normalization";
import { canonicalSamOpportunityUrl } from "../opportunityQuality";

export type OpportunityDedupeKeyType =
  | "provider"
  | "solicitation"
  | "url"
  | "fingerprint";

export interface OpportunityDedupeKey {
  type: OpportunityDedupeKeyType;
  value: string;
}

export interface QualityDecision {
  status: "accepted" | "rejected" | "quarantined";
  reason: string | null;
  completenessScore: number;
  sourceConfidence: number;
}

function normalizeIdentityText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function canonicalizeOpportunityUrl(
  value?: string | null,
): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    const sam = canonicalSamOpportunityUrl(url.toString());
    if (sam) return sam;
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function providerKeyForOpportunity(
  record: NormalizedOpportunity,
): string {
  return normalizedToDbRecord(record).providerKey ?? record.source ?? "manual";
}

export function calculateOpportunityDedupeKeys(
  record: NormalizedOpportunity,
): OpportunityDedupeKey[] {
  const keys: OpportunityDedupeKey[] = [];
  const providerKey = providerKeyForOpportunity(record);
  const providerNativeId = record.externalId?.trim().toLowerCase();
  if (providerNativeId) {
    keys.push({
      type: "provider",
      value: `provider:${providerKey}:${providerNativeId}`,
    });
  }

  const solicitation = normalizeIdentityText(record.solicitationNumber).replace(
    /\s+/g,
    "",
  );
  const agency = normalizeIdentityText(record.agency);
  if (solicitation.length >= 4 && agency.length >= 2) {
    keys.push({
      type: "solicitation",
      value: `solicitation:${solicitation}|agency:${agency}`,
    });
  }

  const canonicalUrl = canonicalizeOpportunityUrl(record.sourceUrl);
  if (canonicalUrl)
    keys.push({ type: "url", value: `url:${canonicalUrl.toLowerCase()}` });

  const title = normalizeIdentityText(record.title);
  if (title.length >= 12 && agency.length >= 2) {
    keys.push({
      type: "fingerprint",
      value: `fingerprint:${title}|agency:${agency}`,
    });
  }

  return keys;
}

export function calculateCompletenessScore(
  record: NormalizedOpportunity,
): number {
  const checks = [
    Boolean(record.title?.trim()),
    Boolean(record.agency?.trim()),
    Boolean(record.externalId?.trim()),
    Boolean(record.sourceUrl?.trim()),
    Boolean(record.postedDate && !Number.isNaN(record.postedDate.getTime())),
    Boolean(
      record.responseDeadline &&
      !Number.isNaN(record.responseDeadline.getTime()),
    ),
    Boolean(record.solicitationNumber?.trim()),
    Boolean(record.description?.trim()),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function calculateSourceConfidence(
  record: NormalizedOpportunity,
): number {
  const raw = record.rawData ?? {};
  const explicit = raw.sourceConfidence;
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return explicit > 1
      ? Math.min(100, Math.max(0, explicit))
      : Math.round(explicit * 100);
  }
  if (explicit === "high") return 90;
  if (explicit === "medium") return 65;
  if (explicit === "low") return 35;
  if (raw.fallback === true) return 30;
  return record.sourceUrl ? 70 : 45;
}

export function decideOpportunityQuality(
  record: NormalizedOpportunity,
): QualityDecision {
  const completenessScore = calculateCompletenessScore(record);
  const sourceConfidence = calculateSourceConfidence(record);
  if (!record.title?.trim() || record.title.trim().length < 10) {
    return {
      status: "quarantined",
      reason: "Missing or implausibly short opportunity title.",
      completenessScore,
      sourceConfidence,
    };
  }
  if (!record.agency?.trim()) {
    return {
      status: "quarantined",
      reason: "Missing buyer or agency identity.",
      completenessScore,
      sourceConfidence,
    };
  }
  if (
    !(record.postedDate instanceof Date) ||
    Number.isNaN(record.postedDate.getTime())
  ) {
    return {
      status: "quarantined",
      reason: "Provider supplied an invalid posted date.",
      completenessScore,
      sourceConfidence,
    };
  }
  if (
    !passesQualityFilter({
      title: record.title,
      description: [record.description, record.agency]
        .filter(Boolean)
        .join(" "),
      sourceUrl: record.sourceUrl,
    })
  ) {
    return {
      status: "rejected",
      reason:
        "Record failed the configured Occu-Med opportunity relevance filter.",
      completenessScore,
      sourceConfidence,
    };
  }
  return {
    status: "accepted",
    reason: null,
    completenessScore,
    sourceConfidence,
  };
}

export function generatedProviderNativeId(
  record: NormalizedOpportunity,
): string {
  if (record.externalId?.trim()) return record.externalId.trim();
  const canonicalUrl = canonicalizeOpportunityUrl(record.sourceUrl);
  const material =
    canonicalUrl ??
    [record.title, record.agency, record.solicitationNumber ?? ""].join("|");
  return `generated-${createHash("sha256").update(material).digest("hex").slice(0, 32)}`;
}

export function serializeOpportunity(
  record: NormalizedOpportunity,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}
