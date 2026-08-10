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
import { rssAggregatorProvider } from "../providers/rssAggregator";
import { selfHostedCrawlerProvider } from "../providers/selfHostedCrawler";
import { selfHostedSearchProvider } from "../providers/selfHostedSearch";
import type { NormalizedOpportunity } from "../providers/types";
import type { ProviderName } from "../config/providerConfig";
import { buildSignalWeights } from "../learning/feedbackModel";
import { runLimitedProviderPool } from "../limitedProviderPool";

const FIRECRAWL_MAX_URLS = 10;
const SERPER_RESULTS_PER_QUERY = 30;
const EXA_RESULTS_PER_QUERY = 20;
const DAY_MS = 86_400_000;

type SearchCandidateProvider =
  | "rssAggregator"
  | "selfHostedSearch"
  | "serper"
  | "exa"
  | "you"
  | "langsearch"
  | "parallel"
  | "linkup"
  | "socrata"
  | "websearch";

type SerperQuery = {
  query: string;
  type?: "search" | "news";
  tbs?: string;
  deep?: boolean;
};

function occumedWebQueries(year: number): SerperQuery[] {
  return [
    `("occupational health services" OR "employee health services") (RFP OR RFQ OR solicitation) (state OR city OR county OR "school district" OR university) ${year} -awarded -jobs`,
    `("medical surveillance" OR "pre-employment physicals") (RFP OR bid OR solicitation) (state OR local OR municipal OR university) ${year} -awarded -jobs`,
    `("drug and alcohol testing" OR "DOT physical") (RFP OR RFQ OR "request for proposal") (city OR county OR transit OR utility) ${year} -awarded -jobs`,
    `("respirator fit testing" OR audiometric OR spirometry) (RFP OR solicitation OR bid) (government OR university OR hospital) ${year} -awarded -jobs`,
    `("request for proposal" OR RFP) ("occupational health" OR "employee medical services") (supplier OR vendor OR subcontractor) ${year} -awarded -jobs`,
    `("occupational medical services" OR "medical screening services") (RFP OR RFQ OR "supplier opportunity") (defense OR aerospace OR logistics OR manufacturing) ${year} -awarded -jobs`,
    `("drug testing services" OR "fitness for duty") (RFP OR "vendor opportunity" OR procurement) (transportation OR utility OR construction OR industrial) ${year} -awarded -jobs`,
    `("clinic network" OR "nationwide occupational health") (RFP OR "request for proposal" OR subcontract) ${year} -awarded -jobs`,
  ].map((query) => ({ query, type: "search" as const }));
}

function exaQueries(year: number): string[] {
  return [
    `active government RFP for occupational health services ${year}`,
    `open solicitation drug testing pre-employment physical services government ${year}`,
    `government contract opportunity occupational medicine DOT physical ${year}`,
    `LOGCAP V2X Amentum KBR subcontractor occupational health deployment medical screening ${year}`,
    `defense contractor deployment medical clearance pre-employment physical RFP ${year}`,
    `provider network clinic occupational health employee health government procurement ${year}`,
    `private company RFP occupational health medical surveillance supplier ${year}`,
    `utility transportation manufacturing RFP employee medical testing drug testing ${year}`,
  ];
}

function boundedDateRange(value: number | undefined): number {
  return Number.isFinite(value)
    ? Math.min(3_650, Math.max(1, Math.floor(value!)))
    : 30;
}

function serperRecencyFilter(days: number): string | undefined {
  if (days <= 7) return "qdr:w";
  if (days <= 31) return "qdr:m";
  if (days <= 365) return "qdr:y";
  return undefined;
}

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
    dateFiltered: number;
    preFiltered: number;
    firecrawlEnriched: number;
    jinaEnriched: number;
    olostepEnriched: number;
    cfWorkerEnriched: number;
    extracted: number;
    heuristicExtracted: number;
    rejected: number;
    expiredRejected: number;
    geminiRateLimited: boolean;
    aiCacheHits: number;
    aiScorers: string[];
  };
  errors: string[];
}

interface Candidate {
  title: string;
  url: string;
  content: string;
  sourceProvider: SearchCandidateProvider;
  dateRaw?: string;
  firecrawlEnriched?: boolean;
  jinaEnriched?: boolean;
  selfHostedCrawlerEnriched?: boolean;
}

function isRfpCandidate(candidate: Candidate): boolean {
  return isRfpCandidateShared(
    candidate.title,
    candidate.content,
    candidate.url,
  );
}

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
  const oneDayAgo = new Date(Date.now() - DAY_MS);
  return deadline < oneDayAgo;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new Error("Web intelligence discovery aborted");
  }
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
  dateRange?: number;
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
  useRssAggregator?: boolean;
  useSelfHostedSearch?: boolean;
  useSelfHostedCrawler?: boolean;
  discoveryPoolId?: string;
  signal?: AbortSignal;
}): Promise<WebIntelligenceResult> {
  throwIfAborted(options.signal);
  const errors: string[] = [];
  const dateRangeDays = boundedDateRange(options.dateRange);
  const publishedAfter = new Date(Date.now() - dateRangeDays * DAY_MS);
  const publishedAfterIso = publishedAfter.toISOString();
  const runtimeYear = new Date().getFullYear();
  const requestedSerperRecency = serperRecencyFilter(dateRangeDays);
  const stats = {
    serperResults: 0,
    exaResults: 0,
    youResults: 0,
    langsearchResults: 0,
    parallelResults: 0,
    linkupResults: 0,
    socrataResults: 0,
    websearchResults: 0,
    rssAggregatorResults: 0,
    selfHostedSearchResults: 0,
    totalCandidates: 0,
    dateFiltered: 0,
    preFiltered: 0,
    firecrawlEnriched: 0,
    jinaEnriched: 0,
    olostepEnriched: 0,
    cfWorkerEnriched: 0,
    selfHostedCrawlerEnriched: 0,
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
  const useRssAggregator = options.useRssAggregator !== false;
  const useSelfHostedSearch = options.useSelfHostedSearch === true;
  const useSelfHostedCrawler = options.useSelfHostedCrawler === true;

  let serperQueries = occumedWebQueries(runtimeYear);
  let exaSearchQueries = exaQueries(runtimeYear);

  if (options.keywords?.trim()) {
    const kw = options.keywords.trim();
    const kwQ = `(${kw}) ("request for proposal" OR solicitation OR "bid opportunity" OR RFQ OR RFP) ("occupational health" OR "drug testing" OR "medical examination" OR "employee health") government ${runtimeYear} -awarded -"contract award"`;
    serperQueries = [
      { query: kwQ, type: "search" as const, deep: true },
      { query: kwQ, type: "news" as const },
      ...serperQueries,
    ];
    exaSearchQueries = [
      `active open government procurement opportunity for ${kw} occupational health medical screening drug testing services ${runtimeYear}`,
      ...exaSearchQueries,
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
    new Set([
      ...serperQueries.map((entry) => entry.query),
      ...exaSearchQueries,
    ]),
  ).slice(0, 10);
  const serperQueryMetadata = new Map(
    serperQueries.map((entry) => [entry.query, entry] as const),
  );

  for (const query of discoveryQueries) {
    throwIfAborted(options.signal);
    const serperQuery = serperQueryMetadata.get(query);
    const attempts: Array<{
      name: SearchCandidateProvider;
      isConfigured: () => Promise<boolean>;
      run: (signal?: AbortSignal) => Promise<Candidate[]>;
    }> = [];

    if (useRssAggregator) {
      attempts.push({
        name: "rssAggregator",
        isConfigured: () => rssAggregatorProvider.isConfigured(),
        run: async (attemptSignal) => {
          const result = await rssAggregatorProvider.fetch({
            limit: 50,
            signal: attemptSignal ?? options.signal,
          });
          return result.records.map((record) => ({
            title: record.title,
            url: record.sourceUrl || "",
            content: record.description || record.title,
            sourceProvider: "rssAggregator" as const,
            dateRaw: record.postedDate?.toISOString(),
          }));
        },
      });
    }

    if (useSelfHostedSearch) {
      attempts.push({
        name: "selfHostedSearch",
        isConfigured: () => selfHostedSearchProvider.isConfigured(),
        run: async (attemptSignal) => {
          const results = await selfHostedSearchProvider.search({
            query,
            limit: 20,
            signal: attemptSignal ?? options.signal,
          });
          return results.map((result) => ({
            title: result.title,
            url: result.url || "",
            content: result.description || result.title,
            sourceProvider: "selfHostedSearch" as const,
            dateRaw: undefined,
          }));
        },
      });
    }

    if (useSerper) {
      attempts.push({
        name: "serper",
        isConfigured: () => serperProvider.isConfigured(),
        run: async (attemptSignal) =>
          (
            await serperProvider.search(query, SERPER_RESULTS_PER_QUERY, {
              type: serperQuery?.type,
              tbs: requestedSerperRecency ?? serperQuery?.tbs,
              signal: attemptSignal ?? options.signal,
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
        run: async (attemptSignal) =>
          (
            await exaProvider.search(query, {
              numResults: EXA_RESULTS_PER_QUERY,
              startPublishedDate: publishedAfterIso,
              signal: attemptSignal ?? options.signal,
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
        run: async (attemptSignal) =>
          (await parallelProvider.search(query, attemptSignal ?? options.signal)).map(
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
        run: async (attemptSignal) =>
          (await linkupProvider.search(query, attemptSignal ?? options.signal)).map(
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
        run: async (attemptSignal) =>
          (await youProvider.search(query, attemptSignal ?? options.signal)).map(
            (result) => ({
              ...result,
              sourceProvider: "you" as const,
            }),
          ),
      });
    }
    if (useLangsearch) {
      attempts.push({
        name: "langsearch",
        isConfigured: () => langsearchProvider.isConfigured(),
        run: async (attemptSignal) =>
          (
            await langsearchProvider.search(query, {
              dateRange: dateRangeDays,
              signal: attemptSignal ?? options.signal,
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
        run: async (attemptSignal) =>
          (
            await socrataProvider.search(
              options.keywords?.trim() ||
                "procurement bids solicitations occupational health",
              attemptSignal ?? options.signal,
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
        run: async (attemptSignal) => {
          const result = await websearchProvider.fetch({
            keywords: query,
            dateRange: dateRangeDays,
            signal: attemptSignal ?? options.signal,
          });
          if (result.records.length === 0 && result.errors.length > 0) {
            throw new Error(result.errors.join("; "));
          }
          return (result.records as any[]).map((record) => ({
            title: record.title ?? "",
            url: record.url ?? record.sourceUrl ?? "",
            content: record.description ?? record.snippet ?? "",
            sourceProvider: "websearch" as const,
            dateRaw: record.postedDate ?? record.date ?? record.updatedAt,
          }));
        },
      });
    }

    const result = await runLimitedProviderPool(
      options.discoveryPoolId ?? "opportunity-web-discovery",
      attempts,
      (value) => value.length > 0,
      { signal: options.signal },
    );
    errors.push(...result.errors);
    if (!result.value || !result.provider) continue;
    switch (result.provider) {
      case "rssAggregator":
        stats.rssAggregatorResults += result.value.length;
        break;
      case "selfHostedSearch":
        stats.selfHostedSearchResults += result.value.length;
        break;
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
    for (const candidate of result.value) addCandidate(candidates, seen, candidate);
  }

  stats.totalCandidates = candidates.length;
  const dateBoundedCandidates = candidates.filter((candidate) => {
    if (!candidate.dateRaw) return true;
    const parsed = new Date(candidate.dateRaw);
    return (
      Number.isNaN(parsed.getTime()) ||
      parsed.getTime() >= publishedAfter.getTime()
    );
  });
  stats.dateFiltered = candidates.length - dateBoundedCandidates.length;
  const filtered = dateBoundedCandidates.filter(isRfpCandidate);
  stats.preFiltered = filtered.length;
  stats.rejected = candidates.length - filtered.length;

  if (filtered.length === 0) return { opportunities: [], stats, errors };

  const enrichedCandidates = [...filtered];
  const toEnrich = enrichedCandidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.content.length < 800)
    .slice(0, FIRECRAWL_MAX_URLS);

  for (const { candidate, index } of toEnrich) {
    throwIfAborted(options.signal);
    const enrichmentAttempts = [
      ...(useSelfHostedCrawler
        ? [
            {
              name: "selfHostedCrawler" as const,
              isConfigured: () => selfHostedCrawlerProvider.isConfigured(),
              run: async (attemptSignal?: AbortSignal) =>
                selfHostedCrawlerProvider.getText(candidate.url, {
                  signal: attemptSignal ?? options.signal,
                }),
            },
          ]
        : []),
      ...(useFirecrawl
        ? [
            {
              name: "firecrawl" as const,
              isConfigured: () => firecrawlProvider.isConfigured(),
              run: async (attemptSignal?: AbortSignal) =>
                (
                  await firecrawlProvider.scrape(
                    candidate.url,
                    attemptSignal ?? options.signal,
                  )
                )?.markdown ?? null,
            },
          ]
        : []),
      {
        name: "jina" as const,
        isConfigured: () => jinaProvider.isConfigured(),
        run: (attemptSignal?: AbortSignal) =>
          jinaProvider.extractUrl(
            candidate.url,
            5_000,
            attemptSignal ?? options.signal,
          ),
      },
      {
        name: "olostep" as const,
        isConfigured: () => olostepProvider.isConfigured(),
        run: (attemptSignal?: AbortSignal) =>
          olostepProvider.getText(candidate.url, attemptSignal ?? options.signal),
      },
      {
        name: "cloudflare-worker" as const,
        isConfigured: () => cloudflareWorkerProvider.isConfigured(),
        run: (attemptSignal?: AbortSignal) =>
          cloudflareWorkerProvider.extractUrl(
            candidate.url,
            8_000,
            attemptSignal ?? options.signal,
          ),
      },
    ];
    const enriched = await runLimitedProviderPool(
      "opportunity-page-enrichment",
      enrichmentAttempts,
      (value) => typeof value === "string" && value.length > 200,
      { signal: options.signal },
    );
    errors.push(...enriched.errors);
    if (!enriched.value || !enriched.provider) continue;
    enrichedCandidates[index] = {
      ...candidate,
      content: enriched.value.slice(0, 5_000),
      firecrawlEnriched: enriched.provider === "firecrawl",
      jinaEnriched: enriched.provider === "jina",
      selfHostedCrawlerEnriched: enriched.provider === "selfHostedCrawler",
    };
    switch (enriched.provider) {
      case "selfHostedCrawler":
        stats.selfHostedCrawlerEnriched++;
        break;
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
    const { extractions, rateLimited, usedScorers, cacheHits } =
      await extractOpportunitiesBatch(
        enrichedCandidates.map((c) => ({
          title: c.title,
          url: c.url,
          content: c.content,
        })),
        options.signal,
      );
    if (rateLimited) stats.geminiRateLimited = true;
    stats.aiCacheHits = cacheHits;
    stats.aiScorers = usedScorers;

    enrichedCandidates.forEach((candidate, idx) => {
      const extraction = extractions[idx];

      if (extraction && !extraction.isOpportunity) {
        stats.rejected++;
        return;
      }

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
        if (cls.rejected) {
          stats.rejected++;
          return;
        }

        opportunities.push(
          buildWebOpportunity(candidate, {
            title: extraction.title ?? candidate.title,
            agency: extraction.agency ?? cls.category ?? "Unknown Organization",
            description: extraction.description,
            deadline: validDeadline,
            location: extraction.location ?? undefined,
            estimatedValue: extraction.estimatedValue ?? undefined,
            relevanceScore: extraction.relevanceScore ?? cls.score,
            relevanceReason:
              extraction.relevanceReason ?? cls.reasons.join("; "),
            cls,
            fallback: false,
            extra: { winnerScorer: extraction.winnerScorer },
          }),
        );
        stats.extracted++;
        return;
      }

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
      opportunities.push(
        buildWebOpportunity(candidate, {
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
        }),
      );
      stats.extracted++;
      stats.heuristicExtracted++;
    });
  } catch (err: any) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? err;
    }
    errors.push(`Web intelligence error: ${err.message}`);
  }

  throwIfAborted(options.signal);
  return {
    opportunities,
    stats,
    errors: Array.from(new Set(errors)).slice(0, 30),
  };
}
