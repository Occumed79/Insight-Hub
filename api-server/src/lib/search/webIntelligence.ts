import { createHash } from "crypto";
import { geminiProvider } from "../providers/gemini";
import { serperProvider } from "../providers/serper";
import type { SerperSearchResult } from "../providers/serper";
import { tavilyProvider } from "../providers/tavily";
import { statePortalsProvider } from "../providers/statePortals";
import { exaProvider } from "../providers/exa";
import { firecrawlProvider } from "../providers/firecrawl";
import { extractMetadataFromText } from "./heuristicExtract";
import { jinaProvider } from "../providers/jina";
import { extractWithMultipleAIs } from "./multiScorer";
import { youProvider } from "../providers/you";
import { langsearchProvider } from "../providers/langsearch";
import { websearchProvider } from "../providers/websearch";
import type { NormalizedOpportunity } from "../providers/types";
import type { ProviderName } from "../config/providerConfig";
import { buildSignalWeights } from "../learning/feedbackModel";

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;
const NOW = new Date();

const GEMINI_BATCH_SIZE = 3;
const GEMINI_BATCH_DELAY_MS = 500;
const FIRECRAWL_MAX_URLS = 10;

type SearchCandidateProvider = "serper" | "tavily" | "exa" | "you" | "langsearch" | "websearch";

const OCCUMED_WEB_QUERIES: { query: string; type?: "search" | "news"; tbs?: string }[] = [
  { query: `site:demandstar.com "occupational health" OR "drug testing" OR "medical examination"`, type: "search" },
  { query: `site:bidsync.com "occupational health" OR "drug screening" OR "occupational medicine"`, type: "search" },
  { query: `site:publicpurchase.com "occupational health" OR "employee health"`, type: "search" },
  { query: `"request for proposal" "occupational health services" deadline ${CURRENT_YEAR} -awarded -award`, type: "search" },
  { query: `"request for proposal" "drug testing" OR "drug screening" government ${CURRENT_YEAR} response due -award`, type: "search" },
  { query: `"occupational health" OR "occupational medicine" RFP solicitation government issued ${CURRENT_YEAR}`, type: "news", tbs: "qdr:m" },
  { query: `"pre-employment" OR "drug testing" OR "DOT physical" "request for proposal" government ${CURRENT_YEAR}`, type: "news", tbs: "qdr:m" },
  { query: `NAICS 621111 OR NAICS 621999 "occupational health" solicitation RFP ${CURRENT_YEAR} active`, type: "search" },
  { query: `"solicitation" "occupational medicine" OR "occupational health" "due date" ${CURRENT_YEAR} OR ${NEXT_YEAR}`, type: "search" },
  { query: `"invitation to bid" OR "sources sought" "occupational health" OR "employee health" government ${CURRENT_YEAR}`, type: "search" },
];

const EXA_QUERIES = [
  `active government RFP for occupational health services ${CURRENT_YEAR}`,
  `open solicitation drug testing pre-employment physical services government ${CURRENT_YEAR}`,
  `government contract opportunity occupational medicine DOT physical ${CURRENT_YEAR}`,
];

const TAVILY_QUERIES = [
  `occupational health services government RFP solicitation open ${CURRENT_YEAR}`,
  `pre-employment drug testing government contract opportunity active ${CURRENT_YEAR}`,
];

const BLOCKED_DOMAINS = [
  "linkedin.com", "facebook.com", "twitter.com", "instagram.com", "x.com",
  "reddit.com", "youtube.com", "tiktok.com",
  "wikipedia.org", "britannica.com",
  "govinfo.gov", "federalregister.gov", "usaspending.gov", "fpds.gov", "regulations.gov", "gao.gov", "opm.gov",
  "bloomberg.com", "reuters.com", "wsj.com", "nytimes.com", "washingtonpost.com",
  "forbes.com", "inc.com", "businesswire.com", "prnewswire.com", "businessinsider.com",
  "apnews.com", "cnbc.com", "cnn.com", "foxbusiness.com", "politico.com",
  "govexec.com", "nextgov.com", "federalnewsnetwork.com",
  "indeed.com", "glassdoor.com", "ziprecruiter.com", "monster.com", "careerbuilder.com", "simplyhired.com", "usajobs.gov", "jobs.mil",
  "yelp.com", "healthgrades.com", "webmd.com", "healthline.com",
  "scribd.com", "slideshare.net", "issuu.com",
  "gartner.com", "capterra.com", "g2.com",
];

const RFP_KEYWORDS = [
  "rfp", "request for proposal", "request for proposals", "solicitation", "invitation to bid", "invitation for bid",
  "itb", "rfq", "request for quotation", "bid opportunity", "bid notice", "sources sought", "pre-solicitation",
  "response due", "proposals due", "submission deadline", "bids due", "seeking proposals", "contract opportunity",
  "procurement notice", "request for information", "rfi", "notice of intent", "sealed bids", "vendor registration",
];

const SERVICE_KEYWORDS = [
  "occupational health", "occupational medicine", "drug testing", "drug screening", "dot physical", "physical exam",
  "pre-employment", "employee health", "medical examination", "medical exam", "fitness for duty", "vaccination",
  "immunization", "respirator", "pulmonary function", "audiogram", "hearing test", "titer", "tb testing",
  "laboratory testing", "x-ray", "ekg", "clinic services", "medical screening",
];

const REJECT_SIGNALS = [
  "contract awarded", "contract award", "award notice", "award announcement", "awarded to", "selected vendor",
  "task order award", "mod to contract", "contract modification", "job description", "job posting", "we are hiring", "career opportunity",
];

export interface WebIntelligenceResult {
  opportunities: NormalizedOpportunity[];
  stats: {
    serperResults: number;
    exaResults: number;
    tavilyResults: number;
    statePortalResults: number;
    youResults: number;
    langsearchResults: number;
    websearchResults: number;
    totalCandidates: number;
    preFiltered: number;
    firecrawlEnriched: number;
    jinaEnriched: number;
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
  content: string;
  sourceProvider: SearchCandidateProvider;
  firecrawlEnriched?: boolean;
  jinaEnriched?: boolean;
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
  if (REJECT_SIGNALS.some((s) => text.includes(s))) return false;
  const hasProcurementSignal = RFP_KEYWORDS.some((kw) => text.includes(kw));
  const hasServiceSignal = SERVICE_KEYWORDS.some((kw) => text.includes(kw));
  return hasProcurementSignal && hasServiceSignal;
}

function isExpiredDeadline(deadline: Date | undefined | null): boolean {
  if (!deadline) return false;
  const oneDayAgo = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
  return deadline < oneDayAgo;
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
          if (err.message?.startsWith("GEMINI_QUOTA_EXCEEDED") && onQuotaExceeded) onQuotaExceeded();
          throw err;
        }
      })
    );
    results.push(...batchResults);
    if (i + batchSize < items.length) await new Promise((res) => setTimeout(res, delayMs));
  }
  return results;
}

function addCandidate(candidates: Candidate[], seen: Set<string>, candidate: Candidate) {
  if (!candidate.url || seen.has(candidate.url) || isBlockedDomain(candidate.url)) return;
  seen.add(candidate.url);
  candidates.push(candidate);
}

export async function webIntelligenceFetch(options: {
  keywords?: string;
  useSerper?: boolean;
  useTavily?: boolean;
  useGemini?: boolean;
  useStatePortals?: boolean;
  useExa?: boolean;
  useFirecrawl?: boolean;
  useYou?: boolean;
  useLangsearch?: boolean;
  useWebsearch?: boolean;
  useGroqFetch?: boolean;
  useOpenrouterFetch?: boolean;
}): Promise<WebIntelligenceResult> {
  const errors: string[] = [];
  const stats = {
    serperResults: 0,
    exaResults: 0,
    tavilyResults: 0,
    statePortalResults: 0,
    youResults: 0,
    langsearchResults: 0,
    websearchResults: 0,
    totalCandidates: 0,
    preFiltered: 0,
    firecrawlEnriched: 0,
    jinaEnriched: 0,
    extracted: 0,
    rejected: 0,
    expiredRejected: 0,
    geminiRateLimited: false,
  };

  const useSerper = options.useSerper === true;
  const useTavily = options.useTavily === true;
  const useGemini = options.useGemini === true;
  const useStatePortals = options.useStatePortals === true;
  const useExa = options.useExa === true;
  const useFirecrawl = options.useFirecrawl === true;
  const useYou = options.useYou === true;
  const useLangsearch = options.useLangsearch === true;
  const useWebsearch = options.useWebsearch === true;

  let serperQueries = [...OCCUMED_WEB_QUERIES];
  let exaQueries = [...EXA_QUERIES];
  let tavilyQueries = [...TAVILY_QUERIES];

  if (options.keywords?.trim()) {
    const kw = options.keywords.trim();
    const kwQ = `(${kw}) ("request for proposal" OR solicitation OR "bid opportunity" OR RFQ OR RFP) ("occupational health" OR "drug testing" OR "medical examination" OR "employee health") government ${CURRENT_YEAR} -awarded -"contract award"`;
    serperQueries = [
      { query: kwQ, type: "search" as const },
      { query: kwQ, type: "news" as const, tbs: "qdr:m" },
      ...serperQueries,
    ];
    exaQueries = [`active open government procurement opportunity for ${kw} occupational health medical screening drug testing services ${CURRENT_YEAR}`, ...exaQueries];
    tavilyQueries = [`${kw} occupational health drug testing medical screening government RFP solicitation open ${CURRENT_YEAR}`, ...tavilyQueries];
  }

  let feedbackHints = "";
  try {
    const weights = await buildSignalWeights();
    if (weights.totalGrades >= 3) {
      const topAgencies = Object.entries(weights.agencies).filter(([, w]) => w > 0).sort(([, a], [, b]) => b - a).slice(0, 5).map(([k]) => k);
      const topKeywords = Object.entries(weights.keywords).filter(([, w]) => w > 0).sort(([, a], [, b]) => b - a).slice(0, 8).map(([k]) => k);
      feedbackHints = [
        topAgencies.length ? `High-value agencies from past feedback: ${topAgencies.join(", ")}.` : "",
        topKeywords.length ? `High-signal keywords from past feedback: ${topKeywords.join(", ")}.` : "",
      ].filter(Boolean).join(" ");
    }
  } catch {}

  if (useGemini) {
    try {
      const keywordsWithHints = [options.keywords, feedbackHints].filter(Boolean).join(". ") || undefined;
      const generated = await geminiProvider.generateSearchQueries(keywordsWithHints);
      serperQueries.push(...generated.map((q) => ({ query: `${q} -awarded -"contract award" -"award notice"`, type: "search" as const })));
    } catch (err: any) {
      if (err.message?.startsWith("GEMINI_QUOTA_EXCEEDED")) {
        stats.geminiRateLimited = true;
        errors.push("Gemini daily quota reached — using built-in search queries.");
      } else {
        errors.push(`Gemini query generation: ${err.message}`);
      }
    }
  }

  const [serperRaw, exaRaw, tavilyRaw, statePortalRaw, youRaw, langsearchRaw, websearchRaw] = await Promise.all([
    useSerper
      ? Promise.allSettled(serperQueries.map((q) => serperProvider.search(q.query, 10, { type: q.type, tbs: q.tbs }).catch(() => [] as SerperSearchResult[])))
          .then((results) => results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])))
          .catch((err: any) => { errors.push(`Serper: ${err.message}`); return []; })
      : Promise.resolve([]),
    useExa
      ? exaProvider.isConfigured().then((configured) => configured ? exaProvider.searchMultiple(exaQueries, 10).catch((err: any) => { errors.push(`Exa: ${err.message}`); return []; }) : [])
      : Promise.resolve([]),
    useTavily
      ? tavilyProvider.researchMultiple(tavilyQueries, 5).catch((err: any) => { errors.push(`Tavily: ${err.message}`); return []; })
      : Promise.resolve([]),
    useStatePortals
      ? statePortalsProvider.search({ keywords: options.keywords }).catch((err: any) => { errors.push(`State Portals: ${err.message}`); return []; })
      : Promise.resolve([]),
    useYou
      ? youProvider.fetch({ keywords: options.keywords }).then((r) => r.records).catch((err: any) => { errors.push(`You.com: ${err.message}`); return []; })
      : Promise.resolve([]),
    useLangsearch
      ? langsearchProvider.fetch({ keywords: options.keywords }).then((r) => r.records).catch((err: any) => { errors.push(`Langsearch: ${err.message}`); return []; })
      : Promise.resolve([]),
    useWebsearch
      ? websearchProvider.fetch({ keywords: options.keywords }).then((r) => r.records).catch((err: any) => { errors.push(`WebSearch: ${err.message}`); return []; })
      : Promise.resolve([]),
  ]);

  stats.serperResults = serperRaw.length;
  stats.exaResults = exaRaw.length;
  stats.tavilyResults = tavilyRaw.length;
  stats.youResults = youRaw.length;
  stats.langsearchResults = langsearchRaw.length;
  stats.websearchResults = websearchRaw.length;

  const statePortalOpportunities = statePortalsProvider.toOpportunities(statePortalRaw);
  stats.statePortalResults = statePortalOpportunities.length;

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const opp of statePortalOpportunities) if (opp.sourceUrl) seen.add(opp.sourceUrl);

  for (const r of serperRaw) addCandidate(candidates, seen, { title: r.title, url: r.link, content: r.snippet, sourceProvider: "serper" });
  for (const r of exaRaw) {
    const url = r.url ?? "";
    addCandidate(candidates, seen, { title: r.title ?? "", url, content: (r.highlights ?? []).join(" ") || r.text?.slice(0, 1000) || "", sourceProvider: "exa" });
  }
  for (const r of tavilyRaw) addCandidate(candidates, seen, { title: r.title, url: r.url, content: r.content, sourceProvider: "tavily" });

  for (const r of youRaw as any[]) addCandidate(candidates, seen, { title: r.title ?? "", url: r.url ?? r.sourceUrl ?? "", content: r.description ?? r.snippet ?? r.description ?? "", sourceProvider: "you" });
  for (const r of langsearchRaw as any[]) addCandidate(candidates, seen, { title: r.title ?? "", url: r.url ?? r.sourceUrl ?? "", content: r.description ?? r.snippet ?? r.content ?? "", sourceProvider: "langsearch" });
  for (const r of websearchRaw as any[]) addCandidate(candidates, seen, { title: r.title ?? "", url: r.url ?? r.sourceUrl ?? "", content: r.description ?? r.snippet ?? r.content ?? "", sourceProvider: "websearch" });

  stats.totalCandidates = candidates.length;
  const filtered = candidates.filter(isRfpCandidate);
  stats.preFiltered = filtered.length;
  stats.rejected = candidates.length - filtered.length;

  if (filtered.length === 0) return { opportunities: statePortalOpportunities, stats, errors };

  const enrichedCandidates = [...filtered];

  if (useFirecrawl) {
    const fcConfigured = await firecrawlProvider.isConfigured();
    if (fcConfigured) {
      const toEnrich = filtered.filter((c) => c.content.length < 800).slice(0, FIRECRAWL_MAX_URLS);
      if (toEnrich.length > 0) {
        try {
          const scraped = await firecrawlProvider.scrapeMany(toEnrich.map((c) => c.url));
          for (const result of scraped) {
            const idx = enrichedCandidates.findIndex((c) => c.url === result.url);
            if (idx >= 0 && result.markdown) {
              enrichedCandidates[idx] = { ...enrichedCandidates[idx], content: result.markdown.slice(0, 4000), firecrawlEnriched: true };
              stats.firecrawlEnriched++;
            }
          }
        } catch (err: any) {
          errors.push(`FireCrawl enrichment: ${err.message}`);
        }
      }
    }
  }

  const jinaConfigured = await jinaProvider.isConfigured();
  if (jinaConfigured) {
    const stillShort = enrichedCandidates.filter((c) => !c.firecrawlEnriched && c.content.length < 600);
    if (stillShort.length > 0) {
      try {
        const jinaResults = await jinaProvider.extractUrls(stillShort.map((c) => c.url), 4, 5000);
        for (const [url, text] of jinaResults) {
          const idx = enrichedCandidates.findIndex((c) => c.url === url);
          if (idx >= 0 && text.length > 200) {
            enrichedCandidates[idx] = { ...enrichedCandidates[idx], content: text, jinaEnriched: true };
            stats.jinaEnriched++;
          }
        }
      } catch (err: any) {
        errors.push(`Jina enrichment: ${err.message}`);
      }
    }
  }

  if (stats.geminiRateLimited) errors.push("Gemini rate limited — falling back to other available scorers.");

  const opportunities: NormalizedOpportunity[] = [];
  let geminiQuotaHit = false;

  try {
    const extractionResults = await runInBatches(
      enrichedCandidates,
      GEMINI_BATCH_SIZE,
      GEMINI_BATCH_DELAY_MS,
      async (candidate) => {
        const extraction = await extractWithMultipleAIs(candidate.title, candidate.url, candidate.content);
        if (!extraction || !extraction.isOpportunity) {
          stats.rejected++;
          return null;
        }

        const deadline = extraction.deadline ? new Date(extraction.deadline) : undefined;
        const validDeadline = deadline && !isNaN(deadline.getTime()) ? deadline : undefined;
        if (isExpiredDeadline(validDeadline)) {
          stats.expiredRejected++;
          stats.rejected++;
          return null;
        }
        if ((extraction.relevanceScore ?? 0) < 45) {
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
          source: candidate.sourceProvider as ProviderName,
          rawData: {
            url: candidate.url,
            relevanceScore: extraction.relevanceScore,
            relevanceReason: extraction.relevanceReason,
            winnerScorer: (extraction as { winnerScorer?: string }).winnerScorer,
            scorerVotes: (extraction as { scorerVotes?: unknown }).scorerVotes,
            extractedFrom: candidate.sourceProvider,
            firecrawlEnriched: candidate.firecrawlEnriched ?? false,
            jinaEnriched: candidate.jinaEnriched ?? false,
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
      errors.push("Gemini quota reached mid-run — remaining candidates discarded to avoid low-quality entries.");
    } else {
      errors.push(`Web intelligence error: ${err.message}`);
    }
  }

  if (geminiQuotaHit) errors.push("Gemini quota hit — remaining unprocessed candidates discarded.");

  return { opportunities: [...statePortalOpportunities, ...opportunities], stats, errors };
}
