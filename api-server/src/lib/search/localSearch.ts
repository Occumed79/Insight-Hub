/**
 * Local (fast) search over already-stored opportunity records.
 *
 * This is the **instant search path**: it queries the PostgreSQL opportunities
 * table directly and ranks results locally. No external APIs, crawlers, or LLMs
 * are called.
 *
 * Contrast with:
 *   - /opportunities/fetch — ingestion/crawler path that hits live sources
 *   - unifiedFetch / webIntelligenceFetch — crawler/scraper pipelines
 */

import { rfpDb as db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { eq, ilike, or, and, gte } from "drizzle-orm";
import type { Opportunity } from "@workspace/db/schema";

export interface SearchFilters {
  source?: string;
  agency?: string;
  state?: string;
  dateRange?: number;
  activeOnly?: boolean;
}

export interface SearchResult {
  id: string;
  title: string;
  agency: string;
  subAgency: string | null;
  description: string | null;
  source: string;
  providerName: string | null;
  sourceUrl: string | null;
  postedDate: Date;
  responseDeadline: Date | null;
  naicsCode: string | null;
  placeOfPerformance: string | null;
  status: "active" | "archived";
  matchScore: number;
  matchReasons: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  timing: {
    dbMs: number;
    totalMs: number;
  };
}

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

function dateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
}

function money(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

function providerLabel(opp: Opportunity): string {
  const raw = opp.providerName || opp.source || "manual";
  const labels: Record<string, string> = {
    samGov: "SAM.gov",
    sam_gov: "SAM.gov",
    grantsGov: "Grants.gov",
    usaSpending: "USASpending",
    statePortals: "State Portals",
    serper: "Serper",
    tavily: "Tavily",
    exa: "Exa",
    firecrawl: "Firecrawl",
    jina: "Jina",
    olostep: "Olostep",
    browseAi: "Browse AI",
    you: "You.com",
    langsearch: "Langsearch",
    websearch: "WebSearch",
    tango: "Tango",
    bidnet: "BidNet",
    csv_import: "CSV Import",
    manual: "Manual",
  };
  return labels[raw] ?? raw;
}

function compact(value: unknown, max = 170): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function serviceLines(opp: Opportunity): string[] {
  const text = `${opp.title} ${opp.description ?? ""} ${opp.notes ?? ""} ${opp.naicsDescription ?? ""}`.toLowerCase();
  const lines: string[] = [];
  if (/\b(occupational health|occupational medicine|medical surveillance|employee health|deployment medical|periodic health assessment)\b/.test(text)) lines.push("Occupational health / medical surveillance");
  if (/\b(physical|medical exam|fitness for duty|fit for duty|return to work|pre[- ]employment|pre[- ]placement|dot exam|dot physical)\b/.test(text)) lines.push("Physical exams / fitness for duty");
  if (/\b(testing|screening|dot program|breath alcohol|random program)\b/.test(text)) lines.push("Workplace testing / DOT program support");
  if (/\b(respirator|fit test|fit testing|pft|spirometry|pulmonary function)\b/.test(text)) lines.push("Respirator / PFT / fit testing");
  if (/\b(audiogram|audiometric|hearing conservation|hearing test)\b/.test(text)) lines.push("Audiograms / hearing conservation");
  if (/\b(vaccine|vaccination|immunization|titer|tb test|tuberculosis|ppd|quantiferon)\b/.test(text)) lines.push("Vaccines / titers / TB testing");
  return Array.from(new Set(lines)).slice(0, 3);
}

function cardReasons(opp: Opportunity, score: number, keywordReasons: string[]): string[] {
  const lines = serviceLines(opp);
  const due = dateOnly(opp.responseDeadline);
  const posted = dateOnly(opp.postedDate);
  const value = money(opp.estimatedValue ?? opp.awardAmount ?? opp.ceilingValue ?? opp.floorValue);
  const buyer = opp.agency && opp.agency !== "Unknown" ? opp.agency : "Unknown buyer";
  const source = providerLabel(opp);
  const hasUrl = Boolean(opp.samUrl);
  const confidence = opp.sourceConfidence || (score >= 75 && lines.length ? "high" : lines.length ? "medium" : "low");
  const decision = lines.length >= 2
    ? "Strong review candidate"
    : lines.length === 1
      ? "Possible fit — verify source"
      : "Needs source check before spending time";
  const missing = [
    !due ? "deadline" : null,
    !value ? "value" : null,
    buyer === "Unknown buyer" ? "buyer" : null,
    !opp.placeOfPerformance ? "location" : null,
    !hasUrl ? "source link" : null,
    lines.length === 0 ? "specific Occu-Med scope" : null,
  ].filter(Boolean).join(", ");

  return Array.from(new Set([
    `Decision: ${decision} (${confidence} confidence).`,
    lines.length ? `Scope: ${lines.join(", ")}.` : `Scope unclear from saved text${compact(opp.description) ? `: ${compact(opp.description)}` : "."}`,
    `Source: ${source}${hasUrl ? " with link" : " without link"}; ${posted ? `posted ${posted}` : "posted date missing"}; ${due ? `due ${due}` : "deadline missing"}.`,
    `Buyer/data: ${buyer}${opp.placeOfPerformance ? ` · ${opp.placeOfPerformance}` : ""}${value ? ` · ${value}` : " · value missing"}.`,
    missing ? `Missing before bid/no-bid: ${missing}.` : "Enough saved data for first-pass review; verify source before action.",
    ...keywordReasons,
  ])).slice(0, 7);
}

function buildMatchReasons(opp: Opportunity, terms: string[]): { reasons: string[]; score: number } {
  const reasons: string[] = [];
  let score = 0;
  const textFields = [opp.title, opp.description, opp.agency, opp.subAgency, opp.solicitationNumber, opp.naicsCode, opp.naicsDescription, opp.placeOfPerformance].filter(Boolean) as string[];
  const normFields = textFields.map((f) => ` ${f.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `);
  const normTerms = terms.map((t) => t.toLowerCase());

  for (const term of normTerms) {
    const titleNorm = ` ${opp.title.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
    if (titleNorm.includes(` ${term} `)) { reasons.push("Query appears directly in title"); score += 40; continue; }
    if (opp.title.toLowerCase().includes(term)) { reasons.push("Query appears in title"); score += 30; continue; }
    if (opp.description?.toLowerCase().includes(term)) { reasons.push("Query appears in saved source description"); score += 20; continue; }
    if (opp.agency.toLowerCase().includes(term) || opp.subAgency?.toLowerCase().includes(term)) { reasons.push("Query matches buyer/agency"); score += 15; continue; }
    if (opp.solicitationNumber?.toLowerCase().includes(term) || opp.naicsCode?.toLowerCase().includes(term) || opp.naicsDescription?.toLowerCase().includes(term) || opp.placeOfPerformance?.toLowerCase().includes(term)) { reasons.push("Query matches solicitation metadata"); score += 10; continue; }
    if (normFields.some((f) => f.includes(` ${term} `))) { reasons.push("Query appears in searchable record text"); score += 5; }
  }

  return { reasons: Array.from(new Set(reasons)), score };
}

function rankAdjust(opp: Opportunity, baseScore: number): number {
  let score = baseScore;
  const now = new Date();
  if (opp.status === "active") score += 10;
  if (opp.responseDeadline && opp.responseDeadline > now) {
    const daysUntil = Math.ceil((opp.responseDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    score += daysUntil <= 30 ? 15 : daysUntil <= 90 ? 8 : 3;
  }
  const daysSincePosted = Math.ceil((now.getTime() - opp.postedDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSincePosted <= 7) score += 10;
  else if (daysSincePosted <= 30) score += 5;
  if (opp.source === "sam_gov" || opp.providerName === "samGov") score += 5;
  return Math.max(0, Math.min(100, score));
}

export async function searchOpportunities(query: string, limit = 50, filters: SearchFilters = {}): Promise<SearchResponse> {
  const totalStart = performance.now();
  const terms = query.trim().split(/\s+/).filter((t) => t.length > 0);
  const whereConditions: any[] = [];

  if (terms.length > 0) {
    const searchPatterns = terms.map((t) => `%${escapeLike(t)}%`);
    const textConditions = searchPatterns.flatMap((pattern) => [
      ilike(opportunitiesTable.title, pattern), ilike(opportunitiesTable.description, pattern), ilike(opportunitiesTable.agency, pattern), ilike(opportunitiesTable.subAgency, pattern),
      ilike(opportunitiesTable.solicitationNumber, pattern), ilike(opportunitiesTable.naicsCode, pattern), ilike(opportunitiesTable.naicsDescription, pattern), ilike(opportunitiesTable.placeOfPerformance, pattern),
    ]);
    whereConditions.push(or(...textConditions));
  }

  if (filters.source) whereConditions.push(or(ilike(opportunitiesTable.source, `%${escapeLike(filters.source.toLowerCase())}%`), ilike(opportunitiesTable.providerName, `%${escapeLike(filters.source.toLowerCase())}%`)));
  if (filters.agency) whereConditions.push(ilike(opportunitiesTable.agency, `%${escapeLike(filters.agency)}%`));
  if (filters.state) whereConditions.push(ilike(opportunitiesTable.placeOfPerformance, `%${escapeLike(filters.state)}%`));
  if (filters.dateRange && filters.dateRange > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filters.dateRange);
    whereConditions.push(gte(opportunitiesTable.postedDate, cutoff));
  }
  if (filters.activeOnly) whereConditions.push(eq(opportunitiesTable.status, "active"));

  const dbStart = performance.now();
  const rows: Opportunity[] = await db.select().from(opportunitiesTable).where(whereConditions.length > 0 ? and(...whereConditions) : undefined).limit(200);
  const dbMs = Math.round(performance.now() - dbStart);

  const ranked = rows
    .map((opp: Opportunity): SearchResult => {
      const { reasons, score } = buildMatchReasons(opp, terms);
      const finalScore = rankAdjust(opp, score);
      return {
        id: opp.id,
        title: opp.title,
        agency: opp.agency,
        subAgency: opp.subAgency,
        description: opp.description,
        source: opp.providerName || opp.source,
        providerName: opp.providerName,
        sourceUrl: opp.samUrl,
        postedDate: opp.postedDate,
        responseDeadline: opp.responseDeadline,
        naicsCode: opp.naicsCode,
        placeOfPerformance: opp.placeOfPerformance,
        status: opp.status,
        matchScore: finalScore,
        matchReasons: cardReasons(opp, finalScore, reasons),
      };
    })
    .sort((a: SearchResult, b: SearchResult) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return { results: ranked, total: rows.length, timing: { dbMs, totalMs: Math.round(performance.now() - totalStart) } };
}
