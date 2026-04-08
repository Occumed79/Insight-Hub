/**
 * Web Intelligence Pipeline
 *
 * Orchestrates Serper + Exa + Tavily + Gemini (+ FireCrawl for full-page content)
 * to discover ACTIVE, OPEN RFP/solicitation opportunities from the web.
 *
 * Pipeline:
 * 1. Gemini generates targeted search queries (falls back to built-in defaults)
 * 2. Serper (Google) + Exa (neural) + Tavily search in parallel
 * 3. Deduplicate by URL; block known non-procurement domains
 * 4. Keyword pre-filter: must contain strong procurement signals
 * 5. FireCrawl enrichment: fetch full page content for top candidates (if configured)
 * 6. Gemini analyzes each candidate with full content, extracts structured data
 * 7. Hard reject: expired deadlines, relevance below threshold, award announcements
 * 8. Fallback: if Gemini unavailable, save pre-filtered results as low-confidence
 */

import { createHash } from "crypto";
import { geminiProvider, OCCUMED_DEFAULT_QUERIES } from "../providers/gemini";
import { serperProvider } from "../providers/serper";
import { tavilyProvider } from "../providers/tavily";
import { statePortalsProvider } from "../providers/statePortals";
import { exaProvider } from "../providers/exa";
import { firecrawlProvider } from "../providers/firecrawl";
import { extractMetadataFromText } from "./heuristicExtract";
import type { NormalizedOpportunity } from "../providers/types";

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;
const NOW = new Date();

// Minimum Gemini relevance score to include (0-100). Raised from 40 to 65.
const MIN_RELEVANCE_SCORE = 65;

// Gemini concurrency per batch
const GEMINI_BATCH_SIZE = 3;
const GEMINI_BATCH_DELAY_MS = 500;

// Max candidates to send to FireCrawl for full-page enrichment (cost/latency control)
const FIRECRAWL_MAX_URLS = 10;

/**
 * Search queries designed to surface ACTIVE, OPEN procurement opportunities.
 * Strategies:
 *  - Direct procurement portal targeting (demandstar, govwin, publicpurchase)
 *  - Strong procurement signal phrases ("request for proposal", "response due")
 *  - Explicit date enforcement (current year in query)
 *  - Negative terms baked in ("-awarded -award -contract award")
 */
const OCCUMED_WEB_QUERIES: { query: string; type?: "search" | "news"; tbs?: string }[] = [
  // Portal-targeted searches — these sites only list active bids
  { query: `site:demandstar.com "occupational health" OR "drug testing" OR "medical examination"`, type: "search" },
  { query: `site:bidsync.com "occupational health" OR "drug screening" OR "occupational medicine"`, type: "search" },
  { query: `site:publicpurchase.com "occupational health" OR "employee health"`, type: "search" },
  // Strong procurement language + current year + no award language
  { query: `"request for proposal" "occupational health services" deadline ${CURRENT_YEAR} -awarded -award`, type: "search" },
  { query: `"request for proposal" "drug testing" OR "drug screening" government ${CURRENT_YEAR} response due -award`, type: "search" },
  // News mode — finds RFPs issued in the last 30 days
  { query: `"occupational health" OR "occupational medicine" RFP solicitation government issued ${CURRENT_YEAR}`, type: "news", tbs: "qdr:m" },
  { query: `"pre-employment" OR "drug testing" OR "DOT physical" "request for proposal" government ${CURRENT_YEAR}`, type: "news", tbs: "qdr:m" },
  // NAICS-targeted government search
  { query: `NAICS 621111 OR NAICS 621999 "occupational health" solicitation RFP ${CURRENT_YEAR} active`, type: "search" },
  // Broader procurement search with deadline language
  { query: `"solicitation" "occupational medicine" OR "occupational health" "due date" ${CURRENT_YEAR} OR ${NEXT_YEAR}`, type: "search" },
  { query: `"invitation to bid" OR "sources sought" "occupational health" OR "employee health" government ${CURRENT_YEAR}`, type: "search" },
];

/**
 * Exa neural search queries — Exa understands intent rather than keywords,
 * so these are written more naturally.
 */
const EXA_QUERIES = [
  `active government RFP for occupational health services ${CURRENT_YEAR}`,
  `open solicitation drug testing pre-employment physical services government ${CURRENT_YEAR}`,
  `government contract opportunity occupational medicine DOT physical ${CURRENT_YEAR}`,
];

/**
 * Tavily queries — deep research mode to surface current procurement intelligence.
 */
const TAVILY_QUERIES = [
  `occupational health services government RFP solicitation open ${CURRENT_YEAR}`,
  `pre-employment drug testing government contract opportunity active ${CURRENT_YEAR}`,
];

/**
 * Domains to block — news aggregators, general content sites, LinkedIn, Wikipedia,
 * and other non-procurement sources that flood Google results.
 */
const BLOCKED_DOMAINS = [
  "linkedin.com", "facebook.com", "twitter.com", "instagram.com",
  "wikipedia.org", "reddit.com", "youtube.com",
  "govinfo.gov", // regulations/FR, not active bids
  "federalregister.gov", // rules, not bids
  "usaspending.gov", // awarded contracts, not open bids
  "fpds.gov", // contract awards
  "bloomberg.com", "reuters.com", "wsj.com", "nytimes.com",
  "forbes.com", "inc.com", "businesswire.com", "prnewswire.com", "businessinsider.com",
  "indeed.com", "glassdoor.com", "ziprecruiter.com", // job sites
  "yelp.com", "healthgrades.com", // consumer sites
];

/**
 * Strong procurement pre-filter. Candidate must match at least one of these
 * in its title + URL + snippet. Terms are deliberately more specific than before
 * to cut out news/blog content.
 */
const RFP_KEYWORDS = [
  "rfp",
  "request for proposal",
  "request for proposals",
  "solicitation",
  "invitation to bid",
  "invitation for bid",
  "itb",
  "rfq",
  "request for quotation",
  "bid opportunity",
  "bid notice",
  "sources sought",
  "pre-solicitation",
  "response due",
  "proposals due",
  "submission deadline",
  "bids due",
  "seeking proposals",
  "contract opportunity",
  "procurement notice",
];

/**
 * Title/snippet signals that indicate this is NOT an active opportunity.
 * Hard-reject anything matching these.
 */
const REJECT_SIGNALS = [
  "contract awarded",
  "contract award",
  "award notice",
  "award announcement",
  "awarded to",
  "selected vendor",
  "task order award",
  "mod to contract",
  "contract modification",
  "job description",
  "job posting",
  "we are hiring",
  "career opportunity",
];

export interface WebIntelligenceResult {
  opportunities: NormalizedOpportunity[];
  stats: {
    serperResults: number;
    exaResults: number;
    tavilyResults: number;
    statePortalResults: number;
    totalCandidates: number;
    preFiltered: number;
    firecrawlEnriched: number;
    extracted: number;
    rejected: number;
    expiredRejected: number;
    geminiRateLimited: boolean;
  };
  errors: string[];
}

interface Candidate {
  title: string;
  url: string;
  content: string; // snippet initially, replaced by full markdown if FireCrawl enriches it
  sourceProvider: "serper" | "tavily" | "exa";
  firecrawlEnriched?: boolean;
}

function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    return BLOCKED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function isRfpCandidate(candidate: Candidate): boolean {
  const text = `${candidate.title} ${candidate.url} ${candidate.content}`.toLowerCase();
  // Hard reject award announcements and job postings up front
  if (REJECT_SIGNALS.some((s) => text.includes(s))) return false;
  // Must match at least one strong procurement keyword
  return RFP_KEYWORDS.some((kw) => text.includes(kw));
}

function isExpiredDeadline(deadline: Date | undefined | null): boolean {
  if (!deadline) return false;
  // Reject if deadline is in the past (with 1-day grace period)
  const oneDayAgo = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
  return deadline < oneDayAgo;
}

function candidateToFallbackOpportunity(candidate: Candidate): NormalizedOpportunity {
  const urlHash = createHash("sha256").update(candidate.url).digest("hex").slice(0, 20);
  const { deadline, estimatedValue, agencyHint } = extractMetadataFromText(
    candidate.content,
    candidate.title
  );

  // Don't save expired fallbacks either
  if (isExpiredDeadline(deadline)) return null as unknown as NormalizedOpportunity;

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
      firecrawlEnriched: candidate.firecrawlEnriched ?? false,
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
  useExa?: boolean;
  useFirecrawl?: boolean;
}): Promise<WebIntelligenceResult> {
  const errors: string[] = [];
  const stats = {
    serperResults: 0,
    exaResults: 0,
    tavilyResults: 0,
    statePortalResults: 0,
    totalCandidates: 0,
    preFiltered: 0,
    firecrawlEnriched: 0,
    extracted: 0,
    rejected: 0,
    expiredRejected: 0,
    geminiRateLimited: false,
  };

  const useSerper = options.useSerper !== false;
  const useTavily = options.useTavily !== false;
  const useGemini = options.useGemini !== false;
  const useStatePortals = options.useStatePortals === true;
  const useExa = options.useExa !== false;
  const useFirecrawl = options.useFirecrawl !== false;

  // ── 1. Generate custom queries if Gemini is available ──────────────────────
  let serperQueries = OCCUMED_WEB_QUERIES;
  let exaQueries = [...EXA_QUERIES];
  let tavilyQueries = [...TAVILY_QUERIES];

  // If user supplied keywords, inject them into all query lists
  if (options.keywords?.trim()) {
    const kw = options.keywords.trim();
    const kwQ = `"${kw}" "request for proposal" OR solicitation OR "bid opportunity" government ${CURRENT_YEAR} -awarded`;
    serperQueries = [
      { query: kwQ, type: "search" as const },
      { query: kwQ, type: "news" as const, tbs: "qdr:m" },
      ...serperQueries,
    ];
    exaQueries = [
      `active government RFP for ${kw} services ${CURRENT_YEAR}`,
      ...exaQueries,
    ];
    tavilyQueries = [
      `${kw} government contract RFP solicitation open ${CURRENT_YEAR}`,
      ...tavilyQueries,
    ];
  }

  // Use Gemini to generate additional targeted Serper queries if configured
  let geminiQueries: { query: string; type?: "search" | "news" }[] = [];
  if (useGemini) {
    try {
      const generated = await geminiProvider.generateSearchQueries(options.keywords);
      // Wrap generated queries with type annotation and add negative terms
      geminiQueries = generated.map((q) => ({
        query: `${q} -awarded -"contract award" -"award notice"`,
        type: "search" as const,
      }));
    } catch (err: any) {
      if (err.message?.startsWith("GEMINI_QUOTA_EXCEEDED")) {
        stats.geminiRateLimited = true;
        errors.push("Gemini daily quota reached — using built-in search queries.");
      } else {
        errors.push(`Gemini query generation: ${err.message}`);
      }
    }
  }

  const allSerperQueries = [...serperQueries, ...geminiQueries];

  // ── 2. Fetch from Serper, Exa, Tavily, and State Portals in parallel ───────
  const [serperRaw, exaRaw, tavilyRaw, statePortalRaw] = await Promise.all([
    useSerper
      ? Promise.allSettled(
          allSerperQueries.map((q) =>
            serperProvider.search(q.query, 10, { type: q.type, tbs: q.tbs }).catch(() => [] as typeof serperRaw[0] extends PromiseSettledResult<infer R> ? R : never)
          )
        ).then((results) =>
          results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
        ).catch((err: any) => {
          errors.push(`Serper: ${err.message}`);
          return [];
        })
      : Promise.resolve([]),

    useExa
      ? exaProvider.isConfigured().then(async (configured) => {
          if (!configured) return [];
          return exaProvider.searchMultiple(exaQueries, 10).catch((err: any) => {
            errors.push(`Exa: ${err.message}`);
            return [];
          });
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

  stats.serperResults = serperRaw.length;
  stats.exaResults = exaRaw.length;
  stats.tavilyResults = tavilyRaw.length;

  const statePortalOpportunities = statePortalsProvider.toOpportunities(statePortalRaw);
  stats.statePortalResults = statePortalOpportunities.length;

  // ── 3. Deduplicate by URL; block non-procurement domains ───────────────────
  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  for (const opp of statePortalOpportunities) {
    if (opp.sourceUrl) seen.add(opp.sourceUrl);
  }

  for (const r of serperRaw) {
    if (!r.link || seen.has(r.link) || isBlockedDomain(r.link)) continue;
    seen.add(r.link);
    candidates.push({ title: r.title, url: r.link, content: r.snippet, sourceProvider: "serper" });
  }

  for (const r of exaRaw) {
    const url = r.url ?? "";
    if (!url || seen.has(url) || isBlockedDomain(url)) continue;
    seen.add(url);
    const content = (r.highlights ?? []).join(" ") || r.text?.slice(0, 1000) || "";
    candidates.push({ title: r.title ?? "", url, content, sourceProvider: "exa" });
  }

  for (const r of tavilyRaw) {
    if (!r.url || seen.has(r.url) || isBlockedDomain(r.url)) continue;
    seen.add(r.url);
    candidates.push({ title: r.title, url: r.url, content: r.content, sourceProvider: "tavily" });
  }

  stats.totalCandidates = candidates.length;

  // ── 4. Keyword pre-filter ──────────────────────────────────────────────────
  const filtered = candidates.filter(isRfpCandidate);
  stats.preFiltered = filtered.length;
  stats.rejected = candidates.length - filtered.length;

  if (filtered.length === 0) {
    return { opportunities: statePortalOpportunities, stats, errors };
  }

  // ── 5. FireCrawl full-page enrichment (top candidates only) ───────────────
  const enrichedCandidates = [...filtered];

  if (useFirecrawl) {
    const fcConfigured = await firecrawlProvider.isConfigured();
    if (fcConfigured) {
      // Only enrich candidates that have short content (snippets), not already-full content
      const toEnrich = filtered
        .filter((c) => c.content.length < 800) // short snippets only
        .slice(0, FIRECRAWL_MAX_URLS);

      if (toEnrich.length > 0) {
        const urls = toEnrich.map((c) => c.url);
        try {
          const scraped = await firecrawlProvider.scrapeMany(urls);
          for (const result of scraped) {
            const idx = enrichedCandidates.findIndex((c) => c.url === result.url);
            if (idx >= 0 && result.markdown) {
              enrichedCandidates[idx] = {
                ...enrichedCandidates[idx],
                content: result.markdown.slice(0, 4000),
                firecrawlEnriched: true,
              };
              stats.firecrawlEnriched++;
            }
          }
        } catch (err: any) {
          errors.push(`FireCrawl enrichment: ${err.message}`);
        }
      }
    }
  }

  if (!useGemini || stats.geminiRateLimited) {
    const fallbackOpps = enrichedCandidates
      .map(candidateToFallbackOpportunity)
      .filter(Boolean);
    return {
      opportunities: [...statePortalOpportunities, ...fallbackOpps],
      stats: { ...stats, extracted: fallbackOpps.length },
      errors: [...errors, "Gemini unavailable — saving pre-filtered results as low-confidence."],
    };
  }

  // ── 6. Gemini extraction with full content ─────────────────────────────────
  const opportunities: NormalizedOpportunity[] = [];
  let geminiQuotaHit = false;

  try {
    const extractionResults = await runInBatches(
      enrichedCandidates,
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

        // ── 7a. Expired deadline hard reject ────────────────────────────────
        const deadline = extraction.deadline ? new Date(extraction.deadline) : undefined;
        const validDeadline = deadline && !isNaN(deadline.getTime()) ? deadline : undefined;

        if (isExpiredDeadline(validDeadline)) {
          stats.expiredRejected++;
          stats.rejected++;
          return null;
        }

        // ── 7b. Relevance threshold ─────────────────────────────────────────
        if ((extraction.relevanceScore ?? 0) < MIN_RELEVANCE_SCORE) {
          stats.rejected++;
          return null;
        }

        const urlHash = createHash("sha256").update(candidate.url).digest("hex").slice(0, 20);

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
            firecrawlEnriched: candidate.firecrawlEnriched ?? false,
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
      errors.push("Gemini quota reached mid-run — saving remaining as low-confidence.");
      const remaining = enrichedCandidates.filter(
        (c) => !opportunities.some((o) => o.sourceUrl === c.url)
      );
      for (const c of remaining) {
        const opp = candidateToFallbackOpportunity(c);
        if (opp) { opportunities.push(opp); stats.extracted++; }
      }
    } else {
      errors.push(`Web intelligence error: ${err.message}`);
    }
  }

  if (geminiQuotaHit) {
    errors.push("Gemini quota hit — remaining candidates saved as low-confidence.");
    const remaining = enrichedCandidates.filter(
      (c) => !opportunities.some((o) => o.sourceUrl === c.url)
    );
    for (const c of remaining) {
      const opp = candidateToFallbackOpportunity(c);
      if (opp) { opportunities.push(opp); stats.extracted++; }
    }
  }

  return { opportunities: [...statePortalOpportunities, ...opportunities], stats, errors };
}
