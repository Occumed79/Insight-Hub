/**
 * Web Intelligence Pipeline
 *
 * Orchestrates Serper + Tavily + Gemini to discover RFP/solicitation opportunities
 * from the open web relevant to Occu-Med's occupational health services.
 *
 * Pipeline:
 * 1. Gemini generates targeted search queries (falls back to built-in defaults)
 * 2. Serper and Tavily search the web in parallel
 * 3. Results are deduplicated by URL
 * 4. Keyword pre-filter: only results containing RFP/solicitation language pass through
 * 5. Gemini analyzes each candidate, extracts structured data, scores relevance
 * 6. Fallback: if Gemini is rate-limited, save pre-filtered candidates directly as
 *    low-confidence opportunities for manual review
 */

import { createHash } from "crypto";
import { geminiProvider, OCCUMED_DEFAULT_QUERIES } from "../providers/gemini";
import { serperProvider } from "../providers/serper";
import { tavilyProvider } from "../providers/tavily";
import { statePortalsProvider } from "../providers/statePortals";
import { extractMetadataFromText } from "./heuristicExtract";
import type { NormalizedOpportunity } from "../providers/types";

const CURRENT_YEAR = new Date().getFullYear();

const TAVILY_BASE_QUERIES = [
  `occupational health services government RFP solicitation open ${CURRENT_YEAR}`,
  `pre-employment drug testing services contract opportunity active ${CURRENT_YEAR}`,
  `occupational medicine clinic services government solicitation ${CURRENT_YEAR} due`,
];

// Minimum Gemini relevance score to include (0-100)
const MIN_RELEVANCE_SCORE = 40;

// Concurrency per Gemini batch
const GEMINI_BATCH_SIZE = 3;

// Delay between Gemini batches (ms) to avoid RPM limits
const GEMINI_BATCH_DELAY_MS = 500;

// RFP keyword pre-filter: candidates must match at least one of these in title/URL/snippet
const RFP_KEYWORDS = [
  "rfp", "request for proposal", "solicitation", "bid opportunity",
  "procurement", "contract opportunity", "bid notice", "invitation to bid",
  "itb", "invitation for bid", "request for quotation", "rfq",
  "proposal", "seeking proposals", "pre-solicitation", "sources sought",
];

export interface WebIntelligenceResult {
  opportunities: NormalizedOpportunity[];
  stats: {
    serperResults: number;
    tavilyResults: number;
    statePortalResults: number;
    totalCandidates: number;
    preFiltered: number;
    extracted: number;
    rejected: number;
    geminiRateLimited: boolean;
  };
  errors: string[];
}

interface Candidate {
  title: string;
  url: string;
  content: string;
  sourceProvider: "serper" | "tavily";
}

function isRfpCandidate(candidate: Candidate): boolean {
  const text = `${candidate.title} ${candidate.url} ${candidate.content}`.toLowerCase();
  return RFP_KEYWORDS.some((kw) => text.includes(kw));
}

function candidateToFallbackOpportunity(candidate: Candidate): NormalizedOpportunity {
  const urlHash = createHash("sha256").update(candidate.url).digest("hex").slice(0, 20);
  const { deadline, estimatedValue, agencyHint } = extractMetadataFromText(
    candidate.content,
    candidate.title
  );
  return {
    externalId: `web-${urlHash}`,
    title: candidate.title,
    agency: agencyHint ?? "Unknown",
    type: "Solicitation",
    status: "active" as const,
    postedDate: new Date(),
    responseDeadline: deadline,
    estimatedValue: estimatedValue,
    description: candidate.content.slice(0, 500),
    sourceUrl: candidate.url,
    source: candidate.sourceProvider,
    rawData: {
      url: candidate.url,
      fallback: true,
      extractedFrom: candidate.sourceProvider,
    },
  };
}

async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  delayMs: number,
  fn: (item: T) => Promise<R | null>,
  onQuotaExceeded?: () => void
): Promise<(R | null)[]> {
  const results: (R | null)[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          return await fn(item);
        } catch (err: any) {
          if (err.message?.startsWith("GEMINI_QUOTA_EXCEEDED") && onQuotaExceeded) {
            onQuotaExceeded();
          }
          throw err;
        }
      })
    );
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  return results;
}

export async function webIntelligenceFetch(options: {
  keywords?: string;
  useSerper?: boolean;
  useTavily?: boolean;
  useGemini?: boolean;
  useStatePortals?: boolean;
}): Promise<WebIntelligenceResult> {
  const errors: string[] = [];
  const stats = {
    serperResults: 0,
    tavilyResults: 0,
    statePortalResults: 0,
    totalCandidates: 0,
    preFiltered: 0,
    extracted: 0,
    rejected: 0,
    geminiRateLimited: false,
  };

  const useSerper = options.useSerper !== false;
  const useTavily = options.useTavily !== false;
  const useGemini = options.useGemini !== false;
  const useStatePortals = options.useStatePortals === true;

  // 1. Generate search queries
  let serperQueries = [...OCCUMED_DEFAULT_QUERIES];
  let tavilyQueries = [...TAVILY_BASE_QUERIES];

  if (useGemini) {
    try {
      const geminiQueries = await geminiProvider.generateSearchQueries(options.keywords);
      if (geminiQueries.length > 0) serperQueries = geminiQueries;
    } catch (err: any) {
      if (err.message?.startsWith("GEMINI_QUOTA_EXCEEDED")) {
        stats.geminiRateLimited = true;
        errors.push("Gemini daily quota reached — using built-in search queries.");
      } else {
        errors.push(`Gemini query generation: ${err.message}`);
      }
    }
  }

  if (options.keywords?.trim()) {
    const kw = options.keywords.trim();
    serperQueries = [
      `"${kw}" RFP OR solicitation OR "request for proposal" occupational health 2025 OR 2026`,
      ...serperQueries,
    ];
    tavilyQueries = [
      `${kw} occupational health government RFP contract opportunity`,
      ...tavilyQueries,
    ];
  }

  // 2. Fetch from Serper, Tavily, and State Portals in parallel
  const [serperResults, tavilyResults, statePortalRaw] = await Promise.all([
    useSerper
      ? serperProvider.searchMultiple(serperQueries, 10).catch((err: any) => {
          errors.push(`Serper: ${err.message}`);
          return [];
        })
      : Promise.resolve([]),
    useTavily
      ? tavilyProvider.researchMultiple(tavilyQueries, 5).catch((err: any) => {
          errors.push(`Tavily: ${err.message}`);
          return [];
        })
      : Promise.resolve([]),
    useStatePortals
      ? statePortalsProvider.search({ keywords: options.keywords }).catch((err: any) => {
          errors.push(`State Portals: ${err.message}`);
          return [];
        })
      : Promise.resolve([]),
  ]);

  stats.serperResults = serperResults.length;
  stats.tavilyResults = tavilyResults.length;

  // Convert state portal results to NormalizedOpportunity up front —
  // they skip Gemini and go straight to the output as low-confidence records.
  const statePortalOpportunities = statePortalsProvider.toOpportunities(statePortalRaw);
  stats.statePortalResults = statePortalOpportunities.length;

  // 3. Deduplicate by URL
  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  // Seed seen set with state portal URLs so Serper/Tavily don't double-add them
  for (const opp of statePortalOpportunities) {
    if (opp.sourceUrl) seen.add(opp.sourceUrl);
  }

  for (const r of serperResults) {
    if (r.link && !seen.has(r.link)) {
      seen.add(r.link);
      candidates.push({ title: r.title, url: r.link, content: r.snippet, sourceProvider: "serper" });
    }
  }
  for (const r of tavilyResults) {
    if (r.url && !seen.has(r.url)) {
      seen.add(r.url);
      candidates.push({ title: r.title, url: r.url, content: r.content, sourceProvider: "tavily" });
    }
  }

  stats.totalCandidates = candidates.length;

  // 4. Keyword pre-filter — only pass RFP-like results to Gemini
  const filtered = candidates.filter(isRfpCandidate);
  stats.preFiltered = filtered.length;
  stats.rejected = candidates.length - filtered.length;

  if (filtered.length === 0) {
    return { opportunities: statePortalOpportunities, stats, errors };
  }

  // 5. Gemini extraction
  if (!useGemini || stats.geminiRateLimited) {
    // No Gemini — save pre-filtered results as low-confidence fallback
    const fallbackOpps = filtered.map(candidateToFallbackOpportunity);
    return {
      opportunities: [...statePortalOpportunities, ...fallbackOpps],
      stats: { ...stats, extracted: fallbackOpps.length },
      errors: [
        ...errors,
        "Gemini unavailable — saving pre-filtered web results for manual review (confidence: low).",
      ],
    };
  }

  const opportunities: NormalizedOpportunity[] = [];
  let geminiQuotaHit = false;

  try {
    const extractionResults = await runInBatches(
      filtered,
      GEMINI_BATCH_SIZE,
      GEMINI_BATCH_DELAY_MS,
      async (candidate) => {
        if (geminiQuotaHit) return null;
        const extraction = await geminiProvider.extractOpportunityFromWebResult(
          candidate.title,
          candidate.url,
          candidate.content
        );

        if (!extraction || !extraction.isOpportunity) {
          stats.rejected++;
          return null;
        }
        if ((extraction.relevanceScore ?? 0) < MIN_RELEVANCE_SCORE) {
          stats.rejected++;
          return null;
        }

        const urlHash = createHash("sha256").update(candidate.url).digest("hex").slice(0, 20);
        const deadline = extraction.deadline ? new Date(extraction.deadline) : undefined;
        const validDeadline = deadline && !isNaN(deadline.getTime()) ? deadline : undefined;

        return {
          externalId: `web-${urlHash}`,
          title: extraction.title ?? candidate.title,
          agency: extraction.agency ?? "Unknown Organization",
          type: "Solicitation",
          status: "active" as const,
          postedDate: new Date(),
          responseDeadline: validDeadline,
          description: extraction.description,
          placeOfPerformance: extraction.location ?? undefined,
          estimatedValue: extraction.estimatedValue ?? undefined,
          sourceUrl: candidate.url,
          source: candidate.sourceProvider,
          rawData: {
            url: candidate.url,
            relevanceScore: extraction.relevanceScore,
            relevanceReason: extraction.relevanceReason,
            extractedFrom: candidate.sourceProvider,
          },
        } as NormalizedOpportunity;
      },
      () => {
        geminiQuotaHit = true;
        stats.geminiRateLimited = true;
      }
    );

    for (const r of extractionResults) {
      if (r) {
        opportunities.push(r);
        stats.extracted++;
      }
    }
  } catch (err: any) {
    if (err.message?.startsWith("GEMINI_QUOTA_EXCEEDED")) {
      stats.geminiRateLimited = true;
      errors.push(
        "Gemini daily quota reached mid-run — saving pre-filtered candidates as low-confidence opportunities for manual review."
      );
      // Fall back to keyword-filtered results
      const remaining = filtered.filter(
        (c) => !opportunities.some((o) => o.sourceUrl === c.url)
      );
      for (const c of remaining) {
        opportunities.push(candidateToFallbackOpportunity(c));
        stats.extracted++;
      }
    } else {
      errors.push(`Web intelligence error: ${err.message}`);
    }
  }

  // If Gemini quota hit during batching, add remaining as fallback
  if (geminiQuotaHit) {
    errors.push(
      "Gemini quota reached — remaining candidates saved as low-confidence results for manual review."
    );
    const remaining = filtered.filter(
      (c) => !opportunities.some((o) => o.sourceUrl === c.url)
    );
    for (const c of remaining) {
      opportunities.push(candidateToFallbackOpportunity(c));
      stats.extracted++;
    }
  }

  return { opportunities: [...statePortalOpportunities, ...opportunities], stats, errors };
}
