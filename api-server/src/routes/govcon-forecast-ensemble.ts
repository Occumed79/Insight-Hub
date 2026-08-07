import { Router } from "express";
import { logger } from "../lib/logger";
import {
  isGovConRecordSuppressed,
  loadGovConSuppressions,
} from "../lib/intelligence/govconFeedback";
import { rankGovConRecords } from "../lib/intelligence/govconIntelligence";
import { fetchAgencyForecastLeads } from "../lib/intelligence/agencyForecastDiscovery";
import {
  providerBudgetAvailable,
  recordProviderFailure,
  recordProviderSuccess,
} from "../lib/providerBudget";

const router = Router();
const GOVCON_BASE_URL = "https://govconapi.com/api/v1";
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60_000;
const RELEVANCE_THRESHOLD = 44;

type JsonRecord = Record<string, unknown>;
type ForecastRecord = ReturnType<typeof normalizeGovConForecast>;

const cache = new Map<string, { expiresAt: number; payload: any }>();

function stringQuery(value: unknown, maxLength = 160): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, Math.floor(parsed)))
    : fallback;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown): boolean {
  return value === true || (typeof value === "string" && value.toLowerCase() === "true");
}

function normalizeGovConForecast(rawValue: unknown) {
  const raw = asRecord(rawValue);
  const incumbentAward = asRecord(raw.incumbent_award);
  const title =
    firstString(raw, ["title", "requirement_title", "description"]) ??
    "Untitled forecast";
  const agency =
    firstString(raw, ["agency", "agency_name", "department_name"]) ??
    "Unknown agency";
  const source = firstString(raw, ["source", "source_name"]) ?? "govconapi";
  const sourceId = firstString(raw, ["source_id", "id", "forecast_id"]);
  const incumbentName =
    firstString(raw, ["incumbent_name", "current_incumbent"]) ??
    firstString(incumbentAward, ["recipient_name"]);
  return {
    id: sourceId ?? `govcon:${agency}:${title}`,
    source,
    sourceId,
    title,
    agency,
    subAgency: firstString(raw, [
      "subagency",
      "sub_agency",
      "office",
      "contracting_office",
    ]),
    description: firstString(raw, [
      "description",
      "requirement_description",
      "summary",
      "notes",
    ]),
    naics: firstString(raw, ["naics", "naics_code"]),
    setAside: firstString(raw, ["set_aside", "setaside"]),
    state: firstString(raw, ["state", "place_of_performance_state"]),
    valueRangeText: firstString(raw, [
      "value_range_text",
      "estimated_value",
      "amount_range",
    ]),
    valueLow: asNumber(raw.value_low ?? raw.amount_min ?? raw.estimated_value_low),
    valueHigh: asNumber(raw.value_high ?? raw.amount_max ?? raw.estimated_value_high),
    estimatedSolicitationDate: firstString(raw, [
      "est_solicitation_date",
      "estimated_solicitation_date",
      "solicitation_date",
    ]),
    estimatedAwardFiscalYear: asNumber(raw.est_award_fy ?? raw.estimated_award_fy),
    estimatedAwardQuarter: firstString(raw, [
      "est_award_quarter",
      "estimated_award_quarter",
    ]),
    status: firstString(raw, ["status", "lifecycle_status"]) ?? "forecast",
    isRecompete: asBoolean(raw.is_recompete),
    recompeteEvidence: "none" as const,
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

function isForwardForecast(record: ForecastRecord): boolean {
  if (/closed|cancelled|canceled|complete|awarded|archived|inactive/i.test(record.status)) {
    return false;
  }
  return Boolean(
    record.estimatedSolicitationDate ||
      record.estimatedAwardFiscalYear ||
      record.estimatedAwardQuarter ||
      /forecast|planned|planning|anticipated|active|open/i.test(record.status),
  );
}

async function fetchGovConForecastPool(
  focus?: string,
  filters: Record<string, string | undefined> = {},
): Promise<{ records: ForecastRecord[]; rawCount: number; error: string | null }> {
  const budgetName = "govcon:forecast";
  if (!(await providerBudgetAvailable(budgetName))) {
    return { records: [], rawCount: 0, error: "GovCon forecast budget is cooling down or exhausted." };
  }
  const apiKey = process.env.GOVCON_API_KEY?.trim();
  if (!apiKey) return { records: [], rawCount: 0, error: "GOVCON_API_KEY is not configured" };

  const url = new URL(`${GOVCON_BASE_URL}/forecasts/search`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("offset", "0");
  url.searchParams.set("active_only", "true");
  url.searchParams.set("sort_by", "est_award_fy");
  url.searchParams.set("sort_order", "asc");
  if (focus) url.searchParams.set("keywords", focus);
  for (const [key, value] of Object.entries(filters)) if (value) url.searchParams.set(key, value);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      const message = `GovCon API returned ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`;
      await recordProviderFailure(budgetName, message);
      return { records: [], rawCount: 0, error: message };
    }
    const payload = asRecord(await response.json());
    const raw = Array.isArray(payload.data) ? payload.data : [];
    const records = raw.map(normalizeGovConForecast).filter(isForwardForecast);
    await recordProviderSuccess(budgetName, records.length);
    return { records, rawCount: raw.length, error: null };
  } catch (error) {
    await recordProviderFailure(budgetName, error);
    return {
      records: [],
      rawCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function matchesFilters(record: any, filters: Record<string, string | undefined>): boolean {
  if (filters.agency && !record.agency.toLowerCase().includes(filters.agency.toLowerCase())) return false;
  if (filters.naics && record.naics && !record.naics.startsWith(filters.naics)) return false;
  if (filters.state && record.state && record.state.toLowerCase() !== filters.state.toLowerCase()) return false;
  return true;
}

router.get("/govcon/forecasts", async (req, res, next) => {
  // Recompete Watch stays on the dedicated award/incumbent-verification path.
  if (req.query.recompete === "true") return next();

  const limit = boundedInteger(req.query.limit, 50, 1, 100);
  const offset = boundedInteger(req.query.offset, 0, 0, 100_000);
  const fitOnly = req.query.fitOnly !== "false";
  const focus = stringQuery(req.query.focus ?? req.query.keywords, 200);
  const filters = {
    agency: stringQuery(req.query.agency, 120),
    naics: stringQuery(req.query.naics, 6),
    source: stringQuery(req.query.source, 30),
    set_aside: stringQuery(req.query.setAside, 40),
    state: stringQuery(req.query.state, 2),
  };
  const cacheKey = JSON.stringify({ limit, offset, fitOnly, focus, filters });
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ ...cached.payload, cached: true });
  }

  try {
    const [govcon, agency] = await Promise.all([
      fetchGovConForecastPool(focus, filters),
      fetchAgencyForecastLeads(focus),
    ]);
    const agencyFiltered = agency.records.filter((record) =>
      matchesFilters(record, filters),
    );
    const combined = [...govcon.records, ...agencyFiltered];
    if (combined.length === 0 && govcon.error && agency.errors.length) {
      return res.status(502).json({
        error: "No forecast source could return usable records.",
        diagnostics: [govcon.error, ...agency.errors].slice(0, 6),
      });
    }

    const suppressions = await loadGovConSuppressions("forecast").catch(() => ({
      recordIds: new Set<string>(),
      fingerprints: new Set<string>(),
    }));
    const unsuppressed = combined.filter(
      (record) => !isGovConRecordSuppressed(suppressions, record),
    );
    const ranked = await rankGovConRecords(unsuppressed, "forecast", focus);
    const filtered = fitOnly
      ? ranked.filter((record) => record.relevance.score >= RELEVANCE_THRESHOLD)
      : ranked;
    const records = filtered.slice(offset, offset + limit);

    const payload = {
      records,
      pagination: {
        limit,
        offset,
        total: filtered.length,
        hasNext: offset + limit < filtered.length,
      },
      sourcePageRecords: combined.length,
      semanticRejectedCount:
        Math.max(0, govcon.rawCount - govcon.records.length),
      suppressedCount: combined.length - unsuppressed.length,
      lowRelevanceCount: ranked.filter(
        (record) => record.relevance.score < RELEVANCE_THRESHOLD,
      ).length,
      filtersApplied: filters,
      semanticProvider: records.some(
        (record) => record.relevance.provider === "gemini",
      )
        ? "gemini"
        : "deterministic",
      source: "govcon+official-fco",
      sourceBreakdown: {
        govcon: govcon.records.length,
        officialAgencyForecasts: agencyFiltered.length,
        agencyDiscoveryProviders: agency.providers,
        recoveredErrors: [govcon.error, ...agency.errors].filter(Boolean),
      },
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
    cache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
    return res.json(payload);
  } catch (error) {
    logger.error({ err: error }, "Forecast ensemble failed");
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Forecast ensemble failed",
    });
  }
});

export default router;
