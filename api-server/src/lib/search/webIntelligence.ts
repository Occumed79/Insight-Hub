import { createHash } from "crypto";
import { geminiProvider } from "../providers/gemini";
import { serperProvider } from "../providers/serper";
import { exaProvider } from "../providers/exa";
import { firecrawlProvider } from "../providers/firecrawl";
import { extractMetadataFromText } from "./heuristicExtract";
import { jinaProvider } from "../providers/jina";
import { extractOpportunitiesBatch } from "./aiExtract";
import {
  classifyResult,
  isBlockedDomain as isBlockedDomainShared,
  isRfpCandidate as isRfpCandidateShared,
  type RelevanceResult,
} from "./relevance";
import { youProvider } from "../providers/you";
import { langsearchProvider } from "../providers/langsearch";
import { parallelProvider } from "../providers/parallel";
import { linkupProvider } from "../providers/linkup";
import { socrataProvider } from "../providers/socrata";
import { websearchProvider } from "../providers/websearch";
import { olostepProvider } from "../providers/olostep";
import { cloudflareWorkerProvider } from "../providers/cloudflareWorker";
import type { NormalizedOpportunity } from "../providers/types";
import type { ProviderName } from "../config/providerConfig";
import { buildSignalWeights } from "../learning/feedbackModel";
import { runLimitedProviderPool } from "../limitedProviderPool";

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;
const NOW = new Date();
const FIRECRAWL_MAX_URLS = 10;

// Result-quantity controls (PR B). Serper/Exa bill per call (not per result for
// Serper), so raising `num` is the cheapest way to deepen each query; page 2 is
// pulled only for the highest-value keyword-driven Serper queries.
const SERPER_RESULTS_PER_QUERY = 30;
const EXA_RESULTS_PER_QUERY = 20;

type SearchCandidateProvider =
  | "serper"
  | "exa"
  | "you"
  | "langsearch"
  | "parallel"
  | "linkup"
  | "socrata"
  | "websearch";

const OCCUMED_WEB_QUERIES: {
  query: string;
  type?: "search" | "news";
  tbs?: string;
}[] = [
  {
    query: `("occupational health services" OR "employee health services") (RFP OR RFQ OR solicitation) (state OR city OR county OR "school district" OR university) ${CURRENT_YEAR} -awarded -jobs`,
  },
  {
    query: `("medical surveillance" OR "pre-employment physicals") (RFP OR bid OR solicitation) (state OR local OR municipal OR university) ${CURRENT_YEAR} -awarded -jobs`,
  },
  {
    query: `("drug and alcohol testing" OR "DOT physical") (RFP OR RFQ OR "request for proposal") (city OR county OR transit OR utility) ${CURRENT_YEAR} -awarded -jobs`,
  },
  {
    query: `("respirator fit testing" OR audiometric OR spirometry) (RFP OR solicitation OR bid) (government OR university OR hospital) ${CURRENT_YEAR} -awarded -jobs`,
  },
  {
    query: `("request for proposal" OR RFP) ("occupational health" OR "employee medical services") (supplier OR vendor OR subcontractor) ${CURRENT_YEAR} -awarded -jobs`,
  },
  {
    query: `("occupational medical services" OR "medical screening services") (RFP OR RFQ OR "supplier opportunity") (defense OR aerospace OR logistics OR manufacturing) ${CURRENT_YEAR} -awarded -jobs`,
  },
  {
    query: `("drug testing services" OR "fitness for duty") (RFP OR "vendor opportunity" OR procurement) (transportation OR utility OR construction OR industrial) ${CURRENT_YEAR} -awarded -jobs`,
  },
  {
    query: `("clinic network" OR "nationwide occupational health") (RFP OR "request for proposal" OR subcontract) ${CURRENT_YEAR} -awarded -jobs`,
  },
].map((entry) => ({ ...entry, type: "search" as const }));

const EXA_QUERIES = [
  `active government RFP for occupational health services ${CURRENT_YEAR}`,
  `open solicitation drug testing pre-employment physical services government ${CURRENT_YEAR}`,
  `government contract opportunity occupational medicine DOT physical ${CURRENT_YEAR}`,
  `LOGCAP V2X Amentum KBR subcontractor occupational health deployment medical screening ${CURRENT_YEAR}`,
  `defense contractor deployment medical clearance pre-employment physical RFP ${CURRENT_YEAR}`,
  `provider network clinic occupational health employee health government procurement ${CURRENT_YEAR}`,
  `private company RFP occupational health medical surveillance supplier ${CURRENT_YEAR}`,
  `utility transportation manufacturing RFP employee medical testing drug testing ${CURRENT_YEAR}`,
];

// Domain blocklist, procurement/service signals, and the RFP pre-filter now live
// in ./relevance (single source of truth shared with the read-time list filter).

export interface WebIntelligenceResult {
  opportunities: NormalizedOpportunity[];
  stats: {
    serperResults: number;
    exaResults: number;
    youResults: number;
    langsearchResults: number;
    parallelResults: number;
    linkupResults: number;
    socrataResults: number;
    websearchResults: number;
    totalCandidates: number;
    preFiltered: number;
    firecrawlEnriched: number;
    jinaEnriched: number;
    olostepEnriched: number;
    cfWorkerEnriched: number;
    extracted: number;
    /** Records kept via deterministic heuristic fallback when AI was unavailable. */
    heuristicExtracted: number;
    rejected: number;
    expiredRejected: number;
    geminiRateLimited: boolean;
    /** Candidates served from the AI extraction cache (no API call spent). */
    aiCacheHits: number;
    /** AI providers that produced at least one batched extraction this run. */
    aiScorers: string[];
  };
  errors: string[];
}

interface Candidate {
  title: string;
  url: string;
  content: string;
  sourceProvider: SearchCandidateProvider;
  /** Raw publication/last-updated date string from the source, if provided. */
  dateRaw?: string;
  firecrawlEnriched?: boolean;
  jinaEnriched?: boolean;
}

function isRfpCandidate(candidate: Candidate): boolean {
  return isRfpCandidateShared(
    candidate.title,
    candidate.content,
    candidate.url,
  );
}

/**
 * Build a NormalizedOpportunity from a web candidate, attaching the transparent
 * relevance score, reasons, parsed publication date, and quality tags that the
 * UI surfaces. Used by both the AI-confirmed and heuristic-fallback paths.
 */
function buildWebOpportunity(
  candidate: Candidate,
  fields: {
    title: string;
    agency: string;
    description?: string;
    deadline?: Date;
    location?: string;
    estimatedValue?: number;
    relevanceScore: number;
    relevanceReason: string;
    cls: RelevanceResult;
    fallback: boolean;
    extra?: Record<string, unknown>;
  },
): NormalizedOpportunity {
  const { cls } = fields;
  const urlHash = createHash("sha256")
    .update(candidate.url)
    .digest("hex")
    .slice(0, 20);
  const dateUnknown = cls.publishedDate == null;

  const tags: string[] = [];
  if (cls.category) tags.push(cls.category);
  if (dateUnknown) tags.push("date-unknown");
  if (cls.stale) tags.push("stale");
  if (fields.fallback) tags.push("ai-pending");

  return {
    externalId: `web-${urlHash}`,
    title: fields.title,
    agency: fields.agency,
    type: "Solicitation",
    status: "active",
    // Real detected publication date when available; otherwise flagged date-unknown.
    postedDate: cls.publishedDate ?? new Date(),
    responseDeadline: fields.deadline,
    description: fields.description,
    placeOfPerformance: fields.location,
    estimatedValue: fields.estimatedValue,
    sourceUrl: candidate.url,
    source: candidate.sourceProvider as ProviderName,
    rawData: {
      url: candidate.url,
      relevanceScore: fields.relevanceScore,
      relevanceReason: fields.relevanceReason,
      relevanceReasons: cls.reasons,
      category: cls.category,
      dateUnknown,
      stale: cls.stale,
      tags,
      fallback: fields.fallback,
      extractedFrom: candidate.sourceProvider,
      firecrawlEnriched: candidate.firecrawlEnriched ?? false,
      jinaEnriched: candidate.jinaEnriched ?? false,
      ...(fields.extra ?? {}),
    },
  };
}

function isExpiredDeadline(deadline: Date | undefined | null): boolean {
  if (!deadline) return false;
  const oneDayAgo = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
  return deadline < oneDayAgo;
}

function addCandidate(
  candidates: Candidate[],
  seen: Set<string>,
  candidate: Candidate,
) {
  if (
    !candidate.url ||
    seen.has(candidate.url) ||
    isBlockedDomainShared(candidate.url)
  )
    return;
  seen.add(candidate.url);
  candidates.push(candidate);
}

export async function webIntelligenceFetch(options: {
  keywords?: string;
  useSerper?: boolean;
  useGemini?: boolean;
  useExa?: boolean;
  useFirecrawl?: boolean;
  useYou?: boolean;
  useLangsearch?: boolean;
  useParallel?: boolean;
  useLinkup?: boolean;
  useSocrata?: boolean;
  useWebsearch?: boolean;
  useGroqFetch?: boolean;
  useOpenrouterFetch?: boolean;
  signal?: AbortSignal;
}): Promise<WebIntelligenceResult> {
  const errors: string[] = [];
  const stats = {
    serperResults: 0,
    exaResults: 0,
    youResults: 0,
    langsearchResults: 0,
    parallelResults: 0,
    linkupResults: 0,
    socrataResults: 0,
    websearchResults: 0,
    totalCandidates: 0,
    preFiltered: 0,
    firecrawlEnriched: 0,
    jinaEnriched: 0,
    olostepEnriched: 0,
    cfWorkerEnriched: 0,
    extracted: 0,
    heuristicExtracted: 0,
    rejected: 0,
    expiredRejected: 0,
    geminiRateLimited: false,
    aiCacheHits: 0,
    aiScorers: [] as string[],
  };

  const useSerper = options.useSerper === true;
  const useGemini = options.useGemini === true;
  const useExa = options.useExa === true;
  const useFirecrawl = options.useFirecrawl === true;
  const useYou = options.useYou === true;
  const useLangsearch = options.useLangsearch === true;
  const useParallel = options.useParallel === true;
  const useLinkup = options.useLinkup === true;
  const useSocrata = options.useSocrata === true;
  const useWebsearch = options.useWebsearch === true;

  type SerperQuery = {
    query: string;
    type?: "search" | "news";
    tbs?: string;
    deep?: boolean;
  };
  let serperQueries: SerperQuery[] = [...OCCUMED_WEB_QUERIES];
  let exaQueries = [...EXA_QUERIES];

  if (options.keywords?.trim()) {
    const kw = options.keywords.trim();
    const kwQ = `(${kw}) ("request for proposal" OR solicitation OR "bid opportunity" OR RFQ OR RFP) ("occupational health" OR "drug testing" OR "medical examination" OR "employee health") government ${CURRENT_YEAR} -awarded -"contract award"`;
    serperQueries = [
      // Keyword-driven queries get extra depth (page 2) since they're most on-target.
      { query: kwQ, type: "search" as const, deep: true },
      { query: kwQ, type: "news" as const, tbs: "qdr:m" },
      ...serperQueries,
    ];
    exaQueries = [
      `active open government procurement opportunity for ${kw} occupational health medical screening drug testing services ${CURRENT_YEAR}`,
      ...exaQueries,
    ];
  }

  let feedbackHints = "";
  try {
    const weights = await buildSignalWeights();
    if (weights.totalGrades >= 3) {
      const topAgencies = Object.entries(weights.agencies)
        .filter(([, w]) => w > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([k]) => k);
      const topKeywords = Object.entries(weights.keywords)
        .filter(([, w]) => w > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([k]) => k);
      feedbackHints = [
        topAgencies.length
          ? `High-value agencies from past feedback: ${topAgencies.join(", ")}.`
          : "",
        topKeywords.length
          ? `High-signal keywords from past feedback: ${topKeywords.join(", ")}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
  } catch {}

  if (useGemini) {
    try {
      const keywordsWithHints =
        [options.keywords, feedbackHints].filter(Boolean).join(". ") ||
        undefined;
      const generated =
        await geminiProvider.generateSearchQueries(keywordsWithHints);
      serperQueries.push(
        ...generated.map((q) => ({
          query: `${q} -awarded -"contract award" -"award notice"`,
          type: "search" as const,
        })),
      );
    } catch (err: any) {
      if (err.message?.startsWith("GEMINI_QUOTA_EXCEEDED")) {
        stats.geminiRateLimited = true;
        errors.push(
          "Gemini daily quota reached — using built-in search queries.",
        );
      } else {
        errors.push(`Gemini query generation: ${err.message}`);
      }
    }
  }

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const discoveryQueries = Array.from(
    new Set([...serperQueries.map((entry) => entry.query), ...exaQueries]),
  ).slice(0, 10);

  for (const query of discoveryQueries) {
    const attempts: Array<{
      name: SearchCandidateProvider;
      isConfigured: () => Promise<boolean>;
      run: () => Promise<Candidate[]>;
    }> = [];

    if (useSerper) {
      attempts.push({
        name: "serper",
        isConfigured: () => serperProvider.isConfigured(),
        run: async () =>
          (
            await serperProvider.search(query, SERPER_RESULTS_PER_QUERY, {
              signal: options.signal,
            })
          ).map((result) => ({
            title: result.title,
            url: result.link,
            content: result.snippet,
            sourceProvider: "serper" as const,
            dateRaw: result.date,
          })),
      });
    }
    if (useExa) {
      attempts.push({
        name: "exa",
        isConfigured: () => exaProvider.isConfigured(),
        run: async () =>
          (
            await exaProvider.search(query, {
              numResults: EXA_RESULTS_PER_QUERY,
              signal: options.signal,
            })
          ).map((result) => ({
            title: result.title ?? "",
            url: result.url ?? "",
            content:
              (result.highlights ?? []).join(" ") ||
              result.text?.slice(0, 1000) ||
              "",
            sourceProvider: "exa" as const,
            dateRaw: result.publishedDate,
          })),
      });
    }
    if (useParallel) {
      attempts.push({
        name: "parallel",
        isConfigured: () => parallelProvider.isConfigured(),
        run: async () =>
          (await parallelProvider.search(query, options.signal)).map(
            (result) => ({
              title: result.title,
              url: result.url,
              content: result.excerpts.join(" "),
              sourceProvider: "parallel" as const,
              dateRaw: result.publishDate,
            }),
          ),
      });
    }
    if (useLinkup) {
      attempts.push({
        name: "linkup",
        isConfigured: () => linkupProvider.isConfigured(),
        run: async () =>
          (await linkupProvider.search(query, options.signal)).map(
            (result) => ({
              title: result.name,
              url: result.url,
              content: result.content,
              sourceProvider: "linkup" as const,
            }),
          ),
      });
    }
    if (useYou) {
      attempts.push({
        name: "you",
        isConfigured: () => youProvider.isConfigured(),
        run: async () =>
          (await youProvider.search(query, options.signal)).map((result) => ({
            ...result,
            sourceProvider: "you" as const,
          })),
      });
    }
    if (useLangsearch) {
      attempts.push({
        name: "langsearch",
        isConfigured: () => langsearchProvider.isConfigured(),
        run: async () =>
          (
            await langsearchProvider.search(query, {
              dateRange: options.keywords ? 365 : 30,
              signal: options.signal,
            })
          ).map((result) => ({
            title: result.title,
            url: result.url,
            content: result.content,
            sourceProvider: "langsearch" as const,
            dateRaw: result.dateRaw,
          })),
      });
    }
    if (useSocrata) {
      attempts.push({
        name: "socrata",
        isConfigured: () => socrataProvider.isConfigured(),
        run: async () =>
          (
            await socrataProvider.search(
              options.keywords?.trim() ||
                "procurement bids solicitations occupational health",
              options.signal,
            )
          ).map((result) => ({
            title: result.title,
            url: result.url,
            content: result.description,
            sourceProvider: "socrata" as const,
            dateRaw: result.updatedAt,
          })),
      });
    }
    if (useWebsearch) {
      attempts.push({
        name: "websearch",
        isConfigured: () => websearchProvider.isConfigured(),
        run: async () => {
          const result = await websearchProvider.fetch({
            keywords: query,
            signal: options.signal,
          });
          if (result.records.length === 0 && result.errors.length > 0) {
            throw new Error(result.errors.join("; "));
          }
          return (result.records as any[]).map((record) => ({
            title: record.title ?? "",
            url: record.url ?? record.sourceUrl ?? "",
            content: record.description ?? record.snippet ?? "",
            sourceProvider: "websearch" as const,
          }));
        },
      });
    }

    const result = await runLimitedProviderPool(
      "opportunity-web-discovery",
      attempts,
      (value) => value.length > 0,
    );
    errors.push(...result.errors);
    if (!result.value || !result.provider) continue;
    switch (result.provider) {
      case "serper":
        stats.serperResults += result.value.length;
        break;
      case "exa":
        stats.exaResults += result.value.length;
        break;
      case "parallel":
        stats.parallelResults += result.value.length;
        break;
      case "linkup":
        stats.linkupResults += result.value.length;
        break;
      case "you":
        stats.youResults += result.value.length;
        break;
      case "langsearch":
        stats.langsearchResults += result.value.length;
        break;
      case "socrata":
        stats.socrataResults += result.value.length;
        break;
      case "websearch":
        stats.websearchResults += result.value.length;
        break;
    }
    for (const candidate of result.value) {
      addCandidate(candidates, seen, candidate);
    }
  }

  stats.totalCandidates = candidates.length;
  const filtered = candidates.filter(isRfpCandidate);
  stats.preFiltered = filtered.length;
  stats.rejected = candidates.length - filtered.length;

  if (filtered.length === 0) return { opportunities: [], stats, errors };

  const enrichedCandidates = [...filtered];
  const toEnrich = enrichedCandidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.content.length < 800)
    .slice(0, FIRECRAWL_MAX_URLS);

  for (const { candidate, index } of toEnrich) {
    const enrichmentAttempts = [
      ...(useFirecrawl
        ? [
            {
              name: "firecrawl",
              isConfigured: () => firecrawlProvider.isConfigured(),
              run: async () =>
                (await firecrawlProvider.scrape(candidate.url))?.markdown ??
                null,
            },
          ]
        : []),
      {
        name: "jina",
        isConfigured: () => jinaProvider.isConfigured(),
        run: () => jinaProvider.extractUrl(candidate.url, 5_000),
      },
      {
        name: "olostep",
        isConfigured: () => olostepProvider.isConfigured(),
        run: () => olostepProvider.getText(candidate.url),
      },
      {
        name: "cloudflare-worker",
        isConfigured: () => cloudflareWorkerProvider.isConfigured(),
        run: () => cloudflareWorkerProvider.extractUrl(candidate.url),
      },
    ];
    const enriched = await runLimitedProviderPool(
      "opportunity-page-enrichment",
      enrichmentAttempts,
      (value) => typeof value === "string" && value.length > 200,
    );
    errors.push(...enriched.errors);
    if (!enriched.value || !enriched.provider) continue;
    enrichedCandidates[index] = {
      ...candidate,
      content: enriched.value.slice(0, 5_000),
      firecrawlEnriched: enriched.provider === "firecrawl",
      jinaEnriched: enriched.provider === "jina",
    };
    switch (enriched.provider) {
      case "firecrawl":
        stats.firecrawlEnriched++;
        break;
      case "jina":
        stats.jinaEnriched++;
        break;
      case "olostep":
        stats.olostepEnriched++;
        break;
      case "cloudflare-worker":
        stats.cfWorkerEnriched++;
        break;
    }
  }

  if (stats.geminiRateLimited)
    errors.push(
      "Gemini rate limited — falling back to other available scorers.",
    );

  const opportunities: NormalizedOpportunity[] = [];

  try {
    // Batched AI extraction rotates across every configured limited AI provider,
    // memoized by URL, and fails over on quota/upstream errors.
    const { extractions, rateLimited, usedScorers, cacheHits } =
      await extractOpportunitiesBatch(
        enrichedCandidates.map((c) => ({
          title: c.title,
          url: c.url,
          content: c.content,
        })),
      );
    if (rateLimited) stats.geminiRateLimited = true;
    stats.aiCacheHits = cacheHits;
    stats.aiScorers = usedScorers;

    enrichedCandidates.forEach((candidate, idx) => {
      const extraction = extractions[idx];

      // Branch A: AI explicitly judged this NOT an opportunity → respect it.
      if (extraction && !extraction.isOpportunity) {
        stats.rejected++;
        return;
      }

      // Branch B: AI confirmed an opportunity → use its structured extraction.
      if (extraction && extraction.isOpportunity) {
        const deadline = extraction.deadline
          ? new Date(extraction.deadline)
          : undefined;
        const validDeadline =
          deadline && !isNaN(deadline.getTime()) ? deadline : undefined;
        if (isExpiredDeadline(validDeadline)) {
          stats.expiredRejected++;
          stats.rejected++;
          return;
        }
        if ((extraction.relevanceScore ?? 0) < 45) {
          stats.rejected++;
          return;
        }

        const cls = classifyResult({
          title: extraction.title ?? candidate.title,
          snippet: candidate.content,
          description: extraction.description,
          url: candidate.url,
          date: candidate.dateRaw,
          deadlineInFuture: !!validDeadline,
          keywords: options.keywords,
        });
        // Safety net: even if an AI accepted it, drop obvious job-board / off-topic junk.
        if (cls.rejected) {
          stats.rejected++;
          return;
        }

        const opp = buildWebOpportunity(candidate, {
          title: extraction.title ?? candidate.title,
          agency: extraction.agency ?? cls.category ?? "Unknown Organization",
          description: extraction.description,
          deadline: validDeadline,
          location: extraction.location ?? undefined,
          estimatedValue: extraction.estimatedValue ?? undefined,
          relevanceScore: extraction.relevanceScore ?? cls.score,
          relevanceReason: extraction.relevanceReason ?? cls.reasons.join("; "),
          cls,
          fallback: false,
          extra: {
            winnerScorer: extraction.winnerScorer,
          },
        });
        opportunities.push(opp);
        stats.extracted++;
        return;
      }

      // Branch C: AI unavailable (null) → deterministic heuristic fallback so we
      // don't silently drop everything when keys are missing / rate-limited.
      const cls = classifyResult({
        title: candidate.title,
        snippet: candidate.content,
        url: candidate.url,
        date: candidate.dateRaw,
        keywords: options.keywords,
      });
      if (cls.rejected || cls.score < 50) {
        stats.rejected++;
        return;
      }
      const meta = extractMetadataFromText(candidate.content, candidate.title);
      if (isExpiredDeadline(meta.deadline)) {
        stats.expiredRejected++;
        stats.rejected++;
        return;
      }
      const opp = buildWebOpportunity(candidate, {
        title: candidate.title,
        agency: meta.agencyHint ?? cls.category ?? "Unknown Organization",
        description: candidate.content.slice(0, 600) || undefined,
        deadline: meta.deadline,
        location: undefined,
        estimatedValue: meta.estimatedValue,
        relevanceScore: cls.score,
        relevanceReason: cls.reasons.join("; "),
        cls,
        fallback: true,
      });
      opportunities.push(opp);
      stats.extracted++;
      stats.heuristicExtracted++;
    });
  } catch (err: any) {
    errors.push(`Web intelligence error: ${err.message}`);
  }

  return {
    opportunities,
    stats,
    errors,
  };
}
