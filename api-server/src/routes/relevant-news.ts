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

const FEDERAL_CONTEXT_PATTERNS = [
  /\bu\.?s\.?\s+(?:federal\s+)?government\b/i,
  /\bunited states\s+(?:federal\s+)?government\b/i,
  /\bdepartment of defense\b/i,
  /\bdefense department\b/i,
  /\bpentagon\b/i,
  /\bu\.?s\.?\s+army\b/i,
  /\bunited states army\b/i,
  /\bu\.?s\.?\s+navy\b/i,
  /\bunited states navy\b/i,
  /\bu\.?s\.?\s+air force\b/i,
  /\bunited states air force\b/i,
  /\bu\.?s\.?\s+space force\b/i,
  /\bunited states space force\b/i,
  /\bu\.?s\.?\s+marine corps\b/i,
  /\bunited states marine corps\b/i,
  /\bdepartment of homeland security\b/i,
  /\bhomeland security\b/i,
  /\bcustoms and border protection\b/i,
  /\bborder patrol\b/i,
  /\bdepartment of veterans affairs\b/i,
  /\bgeneral services administration\b/i,
  /\bdepartment of health and human services\b/i,
  /\bdepartment of energy\b/i,
  /\bdepartment of labor\b/i,
  /\bdod\b/i,
  /\bdhs\b/i,
  /\bgsa\b/i,
  /\bhhs\b/i,
  /\bcbp\b/i,
  /\bfema\b/i,
  /\btsa\b/i,
  /\bnih\b/i,
  /\bcdc\b/i,
];

const PROCUREMENT_CONTEXT_PATTERNS = [
  /\bcontracts?\b/i,
  /\bawards?\b/i,
  /\bprocure(?:ment|ments|s|d|ing)?\b/i,
  /\bacquisition(?:s)?\b/i,
  /\bsolicit(?:ation|ations|s|ed|ing)?\b/i,
  /\brecompete(?:s|d|ing)?\b/i,
  /\brequest for proposals?\b/i,
  /\brfps?\b/i,
  /\bbids?\b/i,
];

function matchesAny(haystack: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(haystack));
}

export function relevantNewsScore(article: JsonRecord): number {
  const haystack = [article.title, article.description, article.content]
    .map((value) => asString(value) ?? "")
    .join(" ")
    .toLowerCase();

  // Generic corporate stories about a "contract award" are not federal
  // contractor intelligence. Require both explicit U.S.-federal context and a
  // procurement/contract signal from the article text itself. Publisher names
  // never satisfy the federal-context gate.
  if (
    !matchesAny(haystack, FEDERAL_CONTEXT_PATTERNS) ||
    !matchesAny(haystack, PROCUREMENT_CONTEXT_PATTERNS)
  ) {
    return 0;
  }

  const weightedTerms: Array<[RegExp, number]> = [
    [/\bfederal contractors?\b/i, 10],
    [/\bgovernment contractors?\b/i, 10],
    [/\bdefense contractors?\b/i, 9],
    [/\bfederal contracts?\b/i, 8],
    [/\bgovernment contracts?\b/i, 8],
    [/\bcontract awards?\b/i, 8],
    [/\brecompete(?:s|d|ing)?\b/i, 8],
    [/\bfederal procurement\b/i, 7],
    [/\bgovernment procurement\b/i, 7],
    [/\bfederal acquisitions?\b/i, 6],
    [/\bgovernment acquisitions?\b/i, 6],
    [/\bsolicit(?:ation|ations|s|ed|ing)?\b/i, 5],
    [/\bdepartment of defense\b/i, 4],
    [/\bhomeland security\b/i, 4],
    [/\bgeneral services administration\b/i, 4],
    [/\bveterans affairs\b/i, 4],
    [/\bdod\b/i, 3],
    [/\bdhs\b/i, 3],
    [/\bgsa\b/i, 3],
    [/\bhhs\b/i, 3],
    [/\bcontracting\b/i, 2],
    [/\bawards?\b/i, 2],
    [/\bcontractors?\b/i, 2],
    [/\bcontracts?\b/i, 3],
    [/\bu\.?s\.?\s+army\b/i, 4],
    [/\bunited states army\b/i, 4],
    [/\bu\.?s\.?\s+navy\b/i, 4],
    [/\bunited states navy\b/i, 4],
    [/\bu\.?s\.?\s+air force\b/i, 4],
    [/\bunited states air force\b/i, 4],
    [/\bu\.?s\.?\s+space force\b/i, 4],
    [/\bunited states space force\b/i, 4],
    [/\bu\.?s\.?\s+marine corps\b/i, 4],
    [/\bunited states marine corps\b/i, 4],
    [/\bpentagon\b/i, 4],
  ];

  return weightedTerms.reduce(
    (score, [pattern, weight]) => score + (pattern.test(haystack) ? weight : 0),
    0,
  );
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
