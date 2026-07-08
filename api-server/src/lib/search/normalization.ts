import type { NormalizedOpportunity } from "../providers/types";
import type { InsertOpportunity } from "@workspace/db/schema";
import { randomUUID } from "crypto";

/**
 * Convert a NormalizedOpportunity into an InsertOpportunity for DB storage.
 * Web-sourced records are stored with source = manual unless they map to an
 * explicit first-party source bucket in the current RFP schema.
 */
export function normalizedToDbRecord(record: NormalizedOpportunity): InsertOpportunity {
  const sourceMap: Record<string, "sam_gov" | "csv_import" | "manual"> = {
    samGov: "sam_gov",
    statePortals: "csv_import",
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
  const tagList = Array.isArray(rawData.tags) ? (rawData.tags as string[]) : [];
  const providerName = typeof rawData.providerName === "string" && rawData.providerName.trim()
    ? rawData.providerName.trim()
    : record.source;
  const notes = typeof rawData.notes === "string" && rawData.notes.trim()
    ? rawData.notes.trim()
    : relevanceReason;
  const rawConfidence = typeof rawData.sourceConfidence === "string" ? rawData.sourceConfidence : null;
  const sourceConfidence = rawConfidence === "high" || rawConfidence === "medium" || rawConfidence === "low"
    ? rawConfidence
    : isFallback
      ? "low"
      : relevanceScore != null
        ? relevanceScore >= 75 ? "high" : relevanceScore >= 50 ? "medium" : "low"
        : null;

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
    providerName,
    relevanceScore: relevanceScore != null ? String(relevanceScore) : null,
    sourceConfidence,
    tags: tagList.length > 0 ? JSON.stringify(tagList) : null,
    notes: isFallback
      ? `Official portal discovery — parser enrichment pending. ${notes ?? ""}`.trim()
      : notes ?? null,
  };
}
