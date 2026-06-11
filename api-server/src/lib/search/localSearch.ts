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

import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { eq, ilike, or, and, gte, sql } from "drizzle-orm";
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

function buildMatchReasons(
  opp: Opportunity,
  terms: string[],
): { reasons: string[]; score: number } {
  const reasons: string[] = [];
  let score = 0;
  const textFields = [
    opp.title,
    opp.description,
    opp.agency,
    opp.subAgency,
    opp.solicitationNumber,
    opp.naicsCode,
    opp.naicsDescription,
    opp.placeOfPerformance,
  ].filter(Boolean) as string[];

  const normFields = textFields.map((f) => ` ${f.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `);
  const normTerms = terms.map((t) => t.toLowerCase());

  for (const term of normTerms) {
    const titleNorm = ` ${opp.title.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
    if (titleNorm.includes(` ${term} `)) {
      reasons.push("Exact title match");
      score += 40;
      continue;
    }
    if (opp.title.toLowerCase().includes(term)) {
      reasons.push("Title match");
      score += 30;
      continue;
    }
    if (opp.description?.toLowerCase().includes(term)) {
      reasons.push("Description match");
      score += 20;
      continue;
    }
    if (opp.agency.toLowerCase().includes(term) || opp.subAgency?.toLowerCase().includes(term)) {
      reasons.push("Agency match");
      score += 15;
      continue;
    }
    if (
      opp.solicitationNumber?.toLowerCase().includes(term) ||
      opp.naicsCode?.toLowerCase().includes(term) ||
      opp.naicsDescription?.toLowerCase().includes(term) ||
      opp.placeOfPerformance?.toLowerCase().includes(term)
    ) {
      reasons.push("Metadata match");
      score += 10;
      continue;
    }
    // Fallback: term appears anywhere in searchable text
    if (normFields.some((f) => f.includes(` ${term} `))) {
      reasons.push("Text match");
      score += 5;
    }
  }

  // Deduplicate reasons while preserving order
  const seen = new Set<string>();
  const uniqueReasons: string[] = [];
  for (const r of reasons) {
    if (!seen.has(r)) {
      seen.add(r);
      uniqueReasons.push(r);
    }
  }

  return { reasons: uniqueReasons, score };
}

function rankAdjust(opp: Opportunity, baseScore: number): number {
  let score = baseScore;
  const now = new Date();

  // Active status bonus
  if (opp.status === "active") {
    score += 10;
  }

  // Future deadline bonus (stronger if sooner)
  if (opp.responseDeadline && opp.responseDeadline > now) {
    const daysUntil = Math.ceil((opp.responseDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 30) {
      score += 15;
    } else if (daysUntil <= 90) {
      score += 8;
    } else {
      score += 3;
    }
  }

  // Recent postedDate bonus
  const daysSincePosted = Math.ceil((now.getTime() - opp.postedDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSincePosted <= 7) {
    score += 10;
  } else if (daysSincePosted <= 30) {
    score += 5;
  }

  // Source quality bonus
  if (opp.source === "sam_gov" || opp.providerName === "samGov") {
    score += 5;
  }

  return score;
}

export async function searchOpportunities(
  query: string,
  limit = 50,
  filters: SearchFilters = {},
): Promise<SearchResponse> {
  const totalStart = performance.now();
  const terms = query.trim().split(/\s+/).filter((t) => t.length > 0);

  // ── Build WHERE conditions ────────────────────────────────────────────────
  const whereConditions: any[] = [];

  // Text search across multiple columns
  if (terms.length > 0) {
    const searchPatterns = terms.map((t) => `%${escapeLike(t)}%`);
    const textConditions = searchPatterns.flatMap((pattern) => [
      ilike(opportunitiesTable.title, pattern),
      ilike(opportunitiesTable.description, pattern),
      ilike(opportunitiesTable.agency, pattern),
      ilike(opportunitiesTable.subAgency, pattern),
      ilike(opportunitiesTable.solicitationNumber, pattern),
      ilike(opportunitiesTable.naicsCode, pattern),
      ilike(opportunitiesTable.naicsDescription, pattern),
      ilike(opportunitiesTable.placeOfPerformance, pattern),
    ]);
    whereConditions.push(or(...textConditions));
  }

  // Source filter
  if (filters.source) {
    const sourceVal = filters.source.toLowerCase();
    whereConditions.push(
      or(
        ilike(opportunitiesTable.source, `%${escapeLike(sourceVal)}%`),
        ilike(opportunitiesTable.providerName, `%${escapeLike(sourceVal)}%`),
      ),
    );
  }

  // Agency filter
  if (filters.agency) {
    whereConditions.push(ilike(opportunitiesTable.agency, `%${escapeLike(filters.agency)}%`));
  }

  // State filter (searches within placeOfPerformance)
  if (filters.state) {
    whereConditions.push(ilike(opportunitiesTable.placeOfPerformance, `%${escapeLike(filters.state)}%`));
  }

  // Date range filter (postedDate within last N days)
  if (filters.dateRange && filters.dateRange > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filters.dateRange);
    whereConditions.push(gte(opportunitiesTable.postedDate, cutoff));
  }

  // Active only filter
  if (filters.activeOnly) {
    whereConditions.push(eq(opportunitiesTable.status, "active"));
  }

  const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

  // ── Execute query ─────────────────────────────────────────────────────────
  const dbStart = performance.now();
  const rows: Opportunity[] = await db
    .select()
    .from(opportunitiesTable)
    .where(whereClause)
    .limit(200); // Cap raw DB fetch for fast ranking
  const dbMs = Math.round(performance.now() - dbStart);

  // ── Rank results locally ──────────────────────────────────────────────────
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
        matchReasons: reasons,
      };
    })
    .sort((a: SearchResult, b: SearchResult) => b.matchScore - a.matchScore)
    .slice(0, limit);

  const totalMs = Math.round(performance.now() - totalStart);

  return {
    results: ranked,
    total: rows.length,
    timing: { dbMs, totalMs },
  };
}
