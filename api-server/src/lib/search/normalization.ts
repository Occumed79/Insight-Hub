import type { NormalizedOpportunity } from "../providers/types";
import type { InsertOpportunity } from "@workspace/db/schema";
import { randomUUID } from "crypto";

/**
 * Convert a NormalizedOpportunity into an InsertOpportunity for DB storage.
 * Web-sourced records (serper/tavily) are stored with source = "manual" and
 * providerName set to the actual source provider.
 */
export function normalizedToDbRecord(record: NormalizedOpportunity): InsertOpportunity {
  const sourceMap: Record<string, "sam_gov" | "csv_import" | "manual"> = {
    samGov: "sam_gov",
    gemini: "manual",
    serper: "manual",
    tavily: "manual",
    tango: "manual",
    bidnet: "manual",
  };

  const rawData = record.rawData ?? {};
  const relevanceScore = rawData.relevanceScore as number | undefined;
  const relevanceReason = rawData.relevanceReason as string | undefined;
  const isFallback = rawData.fallback === true;

  // Auto-archive if the deadline has already passed
  const deadline = record.responseDeadline ?? null;
  const isExpired = deadline != null && deadline < new Date();
  const resolvedStatus = isExpired ? "archived" : record.status;

  return {
    id: randomUUID(),
    noticeId: record.externalId || undefined,
    title: record.title,
    agency: record.agency,
    subAgency: record.subAgency ?? null,
    office: null,
    type: record.type,
    status: resolvedStatus,
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
    estimatedValue: record.estimatedValue != null ? String(record.estimatedValue) : null,
    ceilingValue: null,
    floorValue: null,
    awardAmount: record.awardAmount != null ? String(record.awardAmount) : null,
    awardee: record.awardee ?? null,
    source: sourceMap[record.source] ?? "manual",
    providerName: record.source,
    relevanceScore: relevanceScore != null ? String(relevanceScore) : null,
    sourceConfidence: isFallback
      ? "low"
      : relevanceScore != null
        ? relevanceScore >= 75 ? "high" : relevanceScore >= 50 ? "medium" : "low"
        : null,
    tags: null,
    notes: isFallback
      ? "Web discovery — AI analysis pending (rate limited). Review source URL for details."
      : relevanceReason ?? null,
  };
}
