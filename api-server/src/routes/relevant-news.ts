import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const GNEWS_SEARCH_URL = "https://gnews.io/api/v4/search";
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 30;

// Keep the upstream query broad enough to return useful reporting, then apply
// Occu-Med-specific relevance scoring locally. GNews treats publisher country as
// the source location, not the subject of the article, so no country filter is used.
const BASE_QUERY =
  '("federal contract" OR "government contract" OR "defense contract" OR "contract award" OR "federal procurement" OR "government acquisition" OR recompete OR "GSA contract")';
const FALLBACK_QUERY =
  '("contract award" OR "federal contract" OR "government procurement" OR recompete)';

type JsonRecord = Record<string, unknown>;

type NewsArticle = {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  url: string;
  image: string | null;
  publishedAt: string | null;
  source: {
    name: string;
    url: string | null;
    country: string | null;
  };
  relevanceScore: number;
};

type NewsPayload = {
  articles: NewsArticle[];
  totalArticles: number;
  upstreamArticles: number;
  filteredOut: number;
  query: string;
  source: "gnews";
  fetchedAt: string;
};

type CacheEntry = {
  expiresAt: number;
  payload: NewsPayload;
};

const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<NewsPayload>>();

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function sanitizedSearch(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[()]/g, " ")
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 45) : null;
}

const FEDERAL_CONTEXT_TERMS = [
  "federal",
  "department of defense",
  "defense department",
  "pentagon",
  "u.s. army",
  "us army",
  "army",
  "u.s. navy",
  "us navy",
  "navy",
  "air force",
  "space force",
  "marine corps",
  "homeland security",
  "customs and border protection",
  "border patrol",
  "department of veterans affairs",
  "veterans affairs",
  "general services administration",
  "department of health and human services",
  "department of energy",
  "department of labor",
  "dod",
  "dhs",
  "gsa",
  "hhs",
  "cbp",
  "fema",
  "tsa",
  "nih",
  "cdc",
];

const PROCUREMENT_CONTEXT_TERMS = [
  "contract",
  "award",
  "procurement",
  "acquisition",
  "solicitation",
  "recompete",
  "request for proposal",
  "rfp",
  "bid",
];

function containsAny(haystack: string, terms: readonly string[]): boolean {
  return terms.some((term) => haystack.includes(term));
}

export function relevantNewsScore(article: JsonRecord): number {
  const source = asRecord(article.source);
  const haystack = [article.title, article.description, article.content, source.name]
    .map((value) => asString(value) ?? "")
    .join(" ")
    .toLowerCase();

  // Generic corporate stories about a "contract award" are not federal
  // contractor intelligence. Require both U.S. federal context and a real
  // procurement/contract signal before weighted scoring can admit an article.
  if (
    !containsAny(haystack, FEDERAL_CONTEXT_TERMS) ||
    !containsAny(haystack, PROCUREMENT_CONTEXT_TERMS)
  ) {
    return 0;
  }

  const weightedTerms: Array<[string, number]> = [
    ["federal contractor", 10],
    ["government contractor", 10],
    ["defense contractor", 9],
    ["federal contract", 8],
    ["government contract", 8],
    ["contract award", 8],
    ["recompete", 8],
    ["federal procurement", 7],
    ["government procurement", 7],
    ["federal acquisition", 6],
    ["government acquisition", 6],
    ["solicitation", 5],
    ["department of defense", 4],
    ["homeland security", 4],
    ["general services administration", 4],
    ["veterans affairs", 4],
    ["dod", 3],
    ["dhs", 3],
    ["gsa", 3],
    ["hhs", 3],
    ["contracting", 2],
    ["award", 2],
    ["contractor", 2],
    ["contract", 3],
    ["army", 4],
    ["navy", 4],
    ["air force", 4],
    ["space force", 4],
    ["marine corps", 4],
    ["pentagon", 4],
  ];

  return weightedTerms.reduce((score, [term, weight]) => score + (haystack.includes(term) ? weight : 0), 0);
}

function normalizeArticle(rawValue: unknown): NewsArticle | null {
  const raw = asRecord(rawValue);
  const source = asRecord(raw.source);
  const title = asString(raw.title);
  const url = asString(raw.url);
  if (!title || !url) return null;

  return {
    id: asString(raw.id) ?? url,
    title,
    description: asString(raw.description),
    content: asString(raw.content),
    url,
    image: asString(raw.image),
    publishedAt: asString(raw.publishedAt),
    source: {
      name: asString(source.name) ?? "Unknown source",
      url: asString(source.url),
      country: asString(source.country),
    },
    relevanceScore: relevantNewsScore(raw),
  };
}

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (entry.expiresAt <= now) responseCache.delete(key);
  }
  while (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    responseCache.delete(oldestKey);
  }
}

async function requestGNews(query: string, max: number, page: number, apiKey: string): Promise<JsonRecord> {
  const upstreamUrl = new URL(GNEWS_SEARCH_URL);
  upstreamUrl.searchParams.set("q", query.slice(0, 200));
  upstreamUrl.searchParams.set("lang", "en");
  upstreamUrl.searchParams.set("max", String(max));
  upstreamUrl.searchParams.set("page", String(page));
  upstreamUrl.searchParams.set("sortby", "publishedAt");
  upstreamUrl.searchParams.set("in", "title,description");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        "X-Api-Key": apiKey,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = (await response.text().catch(() => "")).slice(0, 300);
      const statusCode = response.status === 429 ? 429 : response.status === 401 ? 401 : 502;
      throw Object.assign(
        new Error(`GNews API returned ${response.status}${details ? `: ${details}` : ""}`),
        { statusCode },
      );
    }

    return asRecord(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRelevantNews(query: string, max: number, page: number, allowFallback: boolean): Promise<NewsPayload> {
  const apiKey = process.env.GNEWS_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error("GNEWS_API_KEY is not configured"), { statusCode: 503 });
  }

  let effectiveQuery = query;
  let upstream = await requestGNews(effectiveQuery, max, page, apiKey);
  let rawArticles = Array.isArray(upstream.articles) ? upstream.articles : [];

  if (allowFallback && rawArticles.length === 0) {
    effectiveQuery = FALLBACK_QUERY;
    upstream = await requestGNews(effectiveQuery, max, page, apiKey);
    rawArticles = Array.isArray(upstream.articles) ? upstream.articles : [];
  }

  const normalized = rawArticles
    .map(normalizeArticle)
    .filter((article): article is NewsArticle => article !== null)
    .filter((article) => article.relevanceScore >= 6)
    .sort((left, right) => {
      const dateDifference = Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? "");
      if (Number.isFinite(dateDifference) && dateDifference !== 0) return dateDifference;
      return right.relevanceScore - left.relevanceScore;
    });

  return {
    articles: normalized,
    totalArticles:
      typeof upstream.totalArticles === "number" && Number.isFinite(upstream.totalArticles)
        ? upstream.totalArticles
        : rawArticles.length,
    upstreamArticles: rawArticles.length,
    filteredOut: Math.max(0, rawArticles.length - normalized.length),
    query: effectiveQuery,
    source: "gnews",
    fetchedAt: new Date().toISOString(),
  };
}

router.get("/relevant-news", async (req, res) => {
  const userSearch = sanitizedSearch(req.query.search);
  const query = userSearch ? `(${BASE_QUERY}) AND "${userSearch}"` : BASE_QUERY;
  const planSafeMax = boundedInteger(process.env.GNEWS_MAX_ARTICLES, 10, 1, 100);
  const requestedMax = boundedInteger(req.query.max, planSafeMax, 1, 100);
  const max = Math.min(requestedMax, planSafeMax);
  const page = boundedInteger(req.query.page, 1, 1, 100);
  const cacheKey = `${query}|${max}|${page}`;

  pruneCache();
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ ...cached.payload, cached: true });
  }

  try {
    let request = inFlight.get(cacheKey);
    if (!request) {
      request = fetchRelevantNews(query, max, page, !userSearch && page === 1);
      inFlight.set(cacheKey, request);
    }

    const payload = await request;
    responseCache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
    return res.json({ ...payload, cached: false });
  } catch (error) {
    const statusCode = Number((error as { statusCode?: number }).statusCode) || 502;
    const message = error instanceof Error ? error.message : "Failed to retrieve relevant news";
    logger.error({ err: error, query }, "GNews federal-contractor request failed");
    return res.status(statusCode).json({ error: message });
  } finally {
    inFlight.delete(cacheKey);
  }
});

export default router;
