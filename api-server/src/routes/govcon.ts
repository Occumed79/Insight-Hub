import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const GOVCON_BASE_URL = "https://govconapi.com/api/v1";
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 40;

type JsonRecord = Record<string, unknown>;

type ForecastPayload = {
  records: ReturnType<typeof normalizeForecast>[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasNext: boolean;
  };
  filtersApplied: JsonRecord;
  source: "govconapi";
  fetchedAt: string;
};

type CacheEntry = {
  expiresAt: number;
  payload: ForecastPayload;
};

const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ForecastPayload>>();

function stringQuery(value: unknown, maxLength = 160): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function firstString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return null;
}

function normalizeForecast(rawValue: unknown) {
  const raw = asRecord(rawValue);
  const incumbentAward = asRecord(raw.incumbent_award);
  const source = firstString(raw, ["source", "source_name"]);
  const sourceId = firstString(raw, ["source_id", "id", "forecast_id"]);
  const title = firstString(raw, ["title", "requirement_title", "description"]) ?? "Untitled forecast";
  const agency = firstString(raw, ["agency", "agency_name", "department_name"]) ?? "Unknown agency";
  const incumbentName = firstString(raw, ["incumbent_name", "current_incumbent"]) ?? firstString(incumbentAward, ["recipient_name"]);

  return {
    id: sourceId ?? `${source ?? "govcon"}:${agency}:${title}`,
    source,
    sourceId,
    title,
    agency,
    subAgency: firstString(raw, ["subagency", "sub_agency", "office", "contracting_office"]),
    description: firstString(raw, ["description", "requirement_description", "summary", "notes"]),
    naics: firstString(raw, ["naics", "naics_code"]),
    setAside: firstString(raw, ["set_aside", "setaside"]),
    state: firstString(raw, ["state", "place_of_performance_state"]),
    valueRangeText: firstString(raw, ["value_range_text", "estimated_value", "amount_range"]),
    valueLow: asNumber(raw.value_low ?? raw.amount_min ?? raw.estimated_value_low),
    valueHigh: asNumber(raw.value_high ?? raw.amount_max ?? raw.estimated_value_high),
    estimatedSolicitationDate: firstString(raw, ["est_solicitation_date", "estimated_solicitation_date", "solicitation_date"]),
    estimatedAwardFiscalYear: asNumber(raw.est_award_fy ?? raw.estimated_award_fy),
    estimatedAwardQuarter: firstString(raw, ["est_award_quarter", "estimated_award_quarter"]),
    status: firstString(raw, ["status", "lifecycle_status"]),
    isRecompete: asBoolean(raw.is_recompete) || Boolean(incumbentName) || Object.keys(incumbentAward).length > 0,
    incumbentName,
    incumbentAward: Object.keys(incumbentAward).length
      ? {
          recipientName: firstString(incumbentAward, ["recipient_name"]),
          currentValue: asNumber(incumbentAward.current_value),
          expires: firstString(incumbentAward, ["expires", "expiration_date"]),
          awardingAgency: firstString(incumbentAward, ["awarding_agency"]),
          latestActionDate: firstString(incumbentAward, ["latest_action_date"]),
        }
      : null,
    pointOfContact: {
      name: firstString(raw, ["poc_name", "point_of_contact_name", "requirement_owner"]),
      email: firstString(raw, ["poc_email", "point_of_contact_email"]),
      phone: firstString(raw, ["poc_phone", "point_of_contact_phone"]),
    },
    sourceUrl: firstString(raw, ["source_url", "url", "forecast_url"]),
    lastUpdatedDate: firstString(raw, ["last_updated_date", "updated_at", "modified_date"]),
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

async function fetchForecasts(searchParams: URLSearchParams): Promise<ForecastPayload> {
  const apiKey = process.env.GOVCON_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(new Error("GOVCON_API_KEY is not configured"), { statusCode: 503 });
  }

  const upstreamUrl = new URL(`${GOVCON_BASE_URL}/forecasts/search`);
  searchParams.forEach((value, key) => upstreamUrl.searchParams.set(key, value));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(upstreamUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = (await response.text().catch(() => "")).slice(0, 300);
      const statusCode = response.status === 429 ? 429 : 502;
      throw Object.assign(
        new Error(`GovCon API returned ${response.status}${details ? `: ${details}` : ""}`),
        { statusCode },
      );
    }

    const upstream = asRecord(await response.json());
    const data = Array.isArray(upstream.data) ? upstream.data : [];
    const pagination = asRecord(upstream.pagination);

    return {
      records: data.map(normalizeForecast),
      pagination: {
        limit: asNumber(pagination.limit) ?? boundedInteger(searchParams.get("limit"), 50, 1, 100),
        offset: asNumber(pagination.offset) ?? boundedInteger(searchParams.get("offset"), 0, 0, 100_000),
        total: asNumber(pagination.total) ?? data.length,
        hasNext: asBoolean(pagination.has_next),
      },
      filtersApplied: asRecord(upstream.filters_applied),
      source: "govconapi",
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

router.get("/govcon/forecasts", async (req, res) => {
  const params = new URLSearchParams();
  const limit = boundedInteger(req.query.limit, 50, 1, 100);
  const offset = boundedInteger(req.query.offset, 0, 0, 100_000);

  params.set("limit", String(limit));
  params.set("offset", String(offset));
  params.set("active_only", "true");
  params.set("sort_by", stringQuery(req.query.sortBy, 40) ?? "est_award_fy");
  params.set("sort_order", stringQuery(req.query.sortOrder, 8) === "desc" ? "desc" : "asc");

  const optionalFilters: Array<[string, unknown, number]> = [
    ["keywords", req.query.keywords, 120],
    ["agency", req.query.agency, 120],
    ["naics", req.query.naics, 6],
    ["source", req.query.source, 20],
    ["set_aside", req.query.setAside, 40],
    ["state", req.query.state, 2],
  ];

  for (const [key, value, maxLength] of optionalFilters) {
    const parsed = stringQuery(value, maxLength);
    if (parsed) params.set(key, parsed);
  }

  if (req.query.recompete === "true") params.set("is_recompete", "true");

  const cacheKey = params.toString();
  pruneCache();
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ ...cached.payload, cached: true });
  }

  try {
    let request = inFlight.get(cacheKey);
    if (!request) {
      request = fetchForecasts(params);
      inFlight.set(cacheKey, request);
    }

    const payload = await request;
    responseCache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
    return res.json({ ...payload, cached: false });
  } catch (error) {
    const statusCode = Number((error as { statusCode?: number }).statusCode) || 502;
    const message = error instanceof Error ? error.message : "Failed to retrieve GovCon forecasts";
    logger.error({ err: error, filters: Object.fromEntries(params) }, "GovCon forecast request failed");
    return res.status(statusCode).json({ error: message });
  } finally {
    inFlight.delete(cacheKey);
  }
});

export default router;
