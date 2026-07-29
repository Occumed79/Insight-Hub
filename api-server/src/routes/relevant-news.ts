import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const GNEWS_SEARCH_URL = "https://gnews.io/api/v4/search";
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 30;
const BASE_QUERY =
  '("federal contractor" OR "government contractor" OR "defense contractor" OR "federal contract") AND (award OR acquisition OR procurement OR recompete OR solicitation)';

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
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 45) : null;
}

function relevanceScore(article: JsonRecord): number {
  const source = asRecord(article.source);
  const haystack = [article.title, article.description, article.content, source.name]
    .map((value) => asString(value) ?? "")
    .join(" ")
    .toLowerCase();

  const weightedTerms: Array<[string, number]> = [
    ["federal contractor", 10],
    ["government contractor", 10],
    ["defense contractor", 9],
    ["federal contract", 8],
    ["contract award", 7],
    ["recompete", 7],
    ["procurement", 5],
    ["solicitation", 5],
    ["acquisition", 4],
    ["department of defense", 4],
    ["dod", 3],
    ["gsa", 3],
    ["dhs", 3],
    ["hhs", 3],
    ["veterans affairs", 3],
    ["va contract", 3],
    ["award", 2],
    ["contractor", 2],
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
    relevanceScore: relevanceScore(raw),
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

async function fetchRelevantNews(query: string, max: number, page: number): Promise<NewsPayload> {
  const apiKey = process.env.GNEWS_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error("GNEWS_API_KEY is not configured"), { statusCode: 503 });
  }

  const upstreamUrl = new URL(GNEWS_SEARCH_URL);
  upstreamUrl.searchParams.set("q", query);
  upstreamUrl.searchParams.set("lang", "en");
  upstreamUrl.searchParams.set("country", "us");
  upstreamUrl.searchParams.set("max", String(max));
  upstreamUrl.searchParams.set("page", String(page));
  upstreamUrl.searchParams.set("sortby", "publishedAt");
  upstreamUrl.searchParams.set("in", "title,description");
  upstreamUrl.searchParams.set("nullable", "description,image");
  upstreamUrl.searchParams.set("apikey", apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = (await response.text().catch(() => "")).slice(0, 300);
      const statusCode = response.status === 429 ? 429 : 502;
      throw Object.assign(
        new Error(`GNews API returned ${response.status}${details ? `: ${details}` : ""}`),
        { statusCode },
      );
    }

    const upstream = asRecord(await response.json());
    const normalized = (Array.isArray(upstream.articles) ? upstream.articles : [])
      .map(normalizeArticle)
      .filter((article): article is NewsArticle => article !== null)
      .filter((article) => article.relevanceScore >= 4)
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
          : normalized.length,
      query,
      source: "gnews",
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

router.get("/relevant-news", async (req, res) => {
  const userSearch = sanitizedSearch(req.query.search);
  const query = userSearch ? `(${BASE_QUERY}) AND "${userSearch.replace(/"/g, "")}"` : BASE_QUERY;
  const max = boundedInteger(req.query.max, 40, 1, 100);
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
      request = fetchRelevantNews(query.slice(0, 200), max, page);
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
