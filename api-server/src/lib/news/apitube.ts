type JsonRecord = Record<string, unknown>;

const SEARCH_URL = "https://api.apitube.io/v1/news/everything";
const TIMEOUT_MS = 12_000;
const WINDOW_MS = 60_000;
const requestTimes: number[] = [];
let cooldownUntil = 0;

export const TRACKED_CONTRACTORS = [
  "V2X", "Vectrus", "Amentum", "KBR", "Fluor", "Leidos", "SAIC", "CACI",
  "Booz Allen Hamilton", "PAE", "DynCorp", "Serco", "Parsons", "SNC",
  "Lockheed Martin", "RTX", "Raytheon", "Northrop Grumman", "General Dynamics",
  "Boeing", "BAE Systems", "L3Harris", "Airbus", "Safran", "GE Aerospace",
] as const;

const SECTOR_HEADLINES = [
  "defense contract", "defence contract", "defense budget", "defence budget",
  "defense spending", "defence spending", "military spending", "Pentagon budget",
  "defense contractor", "defence contractor", "aerospace", "LOGCAP", "AFCAP",
].map(value => JSON.stringify(value)).join(" OR ");

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function httpUrl(value: unknown): string | null {
  const text = string(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function contractorNewsSignals(raw: JsonRecord): { score: number; companies: string[]; signals: string[] } {
  const text = [raw.title, raw.description, raw.content].map(value => string(value) ?? "").join(" ");
  const entities = Array.isArray(raw.entities)
    ? raw.entities.filter(value => ["organization", "brand"].includes(String(record(value).type)))
      .map(value => string(record(value).name) ?? "").join(" ")
    : "";
  const companies = TRACKED_CONTRACTORS.filter(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(`${text} ${entities}`);
  });
  // Business activity in a relevant sector or a named contractor is required.
  // Publisher branding and generic battlefield reporting cannot satisfy this gate.
  if (/\bworkers?[’']?\s+comp(?:ensation)?\b/i.test(text)) return { score: 0, companies: [], signals: [] };
  const sector = /\b(?:defen[cs]e|aerospace|military|pentagon|LOGCAP|AFCAP)\b/i.test(text);
  const procurement = /\b(?:contracts?|awards?|procurement|recompetes?|solicitations?|RFPs?|backlog)\b/i.test(text);
  const spending = /\b(?:budgets?|spending|appropriations?|funding|investment|investments)\b/i.test(text);
  const activity = /\b(?:earnings|revenue|mergers?|acquisitions?|expansion|expands?|hiring|workforce|jobs?|facilit(?:y|ies)|executive|CEO|appoints?|partnerships?|production|orders?|deliver(?:y|ies))\b/i.test(text);
  if ((!sector && companies.length === 0) || (!procurement && !spending && !activity)) {
    return { score: 0, companies: [...companies], signals: [] };
  }
  const signals = [procurement && "Contracts & procurement", spending && "Budget & spending", activity && "Contractor activity"]
    .filter((value): value is string => Boolean(value));
  return { score: 6 + (companies.length ? 4 : 0) + (procurement ? 4 : 0) + (spending ? 3 : 0), companies: [...companies], signals };
}

export function mapApitubeArticle(value: unknown): JsonRecord {
  const raw = record(value);
  const source = record(raw.source);
  const location = record(source.location);
  const translated = record(record(raw.translations).en);
  const publishedAt = string(raw.published_at);
  return {
    id: raw.id == null ? null : `apitube:${String(raw.id)}`,
    title: string(translated.title) ?? string(raw.title),
    description: string(translated.description) ?? string(raw.description),
    content: string(raw.body)?.slice(0, 6_000) ?? null,
    url: httpUrl(raw.href),
    image: httpUrl(raw.image),
    publishedAt: publishedAt && Number.isFinite(Date.parse(publishedAt)) ? publishedAt : null,
    source: {
      name: string(source.name) ?? string(source.domain) ?? "Unknown source",
      url: httpUrl(source.home_page_url),
      country: string(location.country_code),
    },
    entities: raw.entities,
    provider: "apitube",
  };
}

export function apitubeKeys(): string[] {
  return [...new Set([
    process.env.APITUBE_NEWS_API_KEY, process.env.APITUBE_NEWS_API_KEY_2,
    process.env.APITUBE_NEWS_API_KEY_3,
  ].map(value => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function providerError(status: number, code?: string): Error & { statusCode: number } {
  return Object.assign(new Error(`APITube returned HTTP ${status}${code ? ` (${code})` : ""}`), {
    statusCode: status === 429 ? 429 : status === 401 || status === 403 ? 503 : 502,
  });
}

function reserveRequest(): void {
  const now = Date.now();
  while (requestTimes.length && requestTimes[0]! <= now - WINDOW_MS) requestTimes.shift();
  // Live keys on one account share a quota. Do not rotate on rate/quota errors.
  if (now < cooldownUntil || requestTimes.length >= 10) throw providerError(429);
  requestTimes.push(now);
}

async function requestArticles(params: URLSearchParams, keys: string[]): Promise<unknown[]> {
  const url = new URL(SEARCH_URL);
  url.search = params.toString();
  for (const [index, key] of keys.entries()) {
    reserveRequest();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "X-API-Key": key, "User-Agent": "Insight-Hub/1.0" }, signal: controller.signal,
      });
      const data = record(await response.json().catch(() => null));
      // Never surface upstream messages/URLs: the provider may echo credentials.
      const firstError = Array.isArray(data.errors) ? record(data.errors[0]) : {};
      const candidateCode = string(data.code) ?? string(record(data.error).code) ?? string(firstError.code);
      const code = candidateCode && /^ER\d{4}$/.test(candidateCode) ? candidateCode : undefined;
      if (response.status === 429 || code === "ER0203" || code === "ER0204") {
        const retryAfter = response.headers.get("retry-after");
        const seconds = Number(retryAfter);
        const retryTime = Number.isFinite(seconds) && seconds > 0 ? Date.now() + seconds * 1000 : Date.parse(retryAfter ?? "");
        cooldownUntil = Math.max(Date.now() + WINDOW_MS, Number.isFinite(retryTime) ? retryTime : 0);
        throw providerError(429, code);
      }
      // A second credential is only a fallback for an invalid/revoked key.
      if (response.status === 401 && index < keys.length - 1) continue;
      if (!response.ok || data.status !== "ok" || !Array.isArray(data.results)) {
        throw providerError(response.ok ? 502 : response.status, code);
      }
      return data.results;
    } catch (error) {
      if (error instanceof Error && "statusCode" in error) throw error;
      throw Object.assign(new Error("APITube request failed or timed out"), { statusCode: 502 });
    } finally {
      clearTimeout(timer);
    }
  }
  throw providerError(401);
}

export async function fetchApitubeNews(search: string | null, max: number, page: number): Promise<{
  articles: JsonRecord[]; warnings: string[];
}> {
  const keys = apitubeKeys();
  if (!keys.length) throw Object.assign(new Error("APITube news keys are not configured"), { statusCode: 503 });
  const configuredMax = Number(process.env.APITUBE_NEWS_MAX_ARTICLES);
  const perPage = Math.min(max, Number.isFinite(configuredMax) && configuredMax >= 1 ? Math.min(250, Math.floor(configuredMax)) : 10);
  const filters = search ? [{ query: JSON.stringify(search) }] : [
    // Title search also covers companies absent from APITube's entity directory.
    // organization.name rejects the entire request if even one name is unknown.
    { query: TRACKED_CONTRACTORS.map(value => JSON.stringify(value)).join(" OR ") },
    { query: SECTOR_HEADLINES },
  ];
  const articles: JsonRecord[] = [];
  const warnings: string[] = [];
  let succeeded = false;
  let lastError: unknown;
  for (const filter of filters) {
    const params = new URLSearchParams({
      "language.code": "en", per_page: String(perPage), page: String(page),
      "sort.by": "published_at", "sort.order": "desc",
      "published_at.start": new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      "published_at.end": new Date().toISOString(), ...filter,
    });
    try {
      articles.push(...(await requestArticles(params, keys)).map(mapApitubeArticle));
      succeeded = true;
    } catch (error) {
      lastError = error;
      warnings.push(error instanceof Error ? error.message : "APITube feed unavailable");
      // All remaining feeds share this provider's cooldown/quota.
      if ((error as { statusCode?: number }).statusCode === 429) break;
    }
  }
  if (!succeeded) throw lastError;
  return { articles, warnings };
}
