import type {
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
} from "./types";
import { composeAbortSignal } from "./abortSignals";

const GOVCON_BASE_URL = "https://govconapi.com/api/v1";
const REQUEST_TIMEOUT_MS = 20_000;
const FREE_SEARCH_WINDOW_DAYS = 90;
const DEFAULT_QUERY_LIMIT = 100;

const DEFAULT_QUERIES = [
  "occupational health",
  "drug testing",
  "medical surveillance",
  "pre-employment physical",
] as const;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function firstString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return undefined;
}

function asDate(value: unknown): Date | undefined {
  const text = asString(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function firstDate(record: JsonRecord, keys: string[]): Date | undefined {
  for (const key of keys) {
    const value = asDate(record[key]);
    if (value) return value;
  }
  return undefined;
}

function placeOfPerformance(raw: JsonRecord): string | undefined {
  const direct = firstString(raw, [
    "place_of_performance",
    "placeOfPerformance",
    "location",
  ]);
  if (direct) return direct;

  const place = asRecord(
    raw.place_of_performance ?? raw.placeOfPerformance ?? raw.performance_location,
  );
  const city = firstString(place, ["city", "city_name"]);
  const state = firstString(place, ["state", "state_code"]);
  const country = firstString(place, ["country", "country_code"]);
  const parts = [city, state, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function fmtDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function configuredToken(): string | null {
  const raw =
    process.env.GOVCON_API_KEY?.trim() || process.env.GOVCON_AUTH?.trim() || "";
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  return token || null;
}

function sourceUrl(raw: JsonRecord, noticeId: string): string | undefined {
  return (
    firstString(raw, [
      "ui_link",
      "source_url",
      "sam_url",
      "url",
      "additional_info_link",
    ]) || (noticeId ? `https://sam.gov/opp/${noticeId}/view` : undefined)
  );
}

function normalize(rawValue: unknown): NormalizedOpportunity | null {
  const raw = asRecord(rawValue);
  const noticeId =
    firstString(raw, ["notice_id", "noticeId", "id"]) ||
    firstString(raw, ["solicitation_number", "solicitationNumber"]);
  if (!noticeId) return null;

  const postedDate =
    firstDate(raw, ["posted_date", "postedDate", "publication_date"]) ??
    new Date(0);
  const responseDeadline = firstDate(raw, [
    "response_deadline",
    "responseDeadline",
    "due_date",
    "dueDate",
  ]);
  const activeValue = raw.active;
  const explicitlyInactive =
    activeValue === false ||
    (typeof activeValue === "string" && activeValue.toLowerCase() === "false");

  return {
    externalId: noticeId,
    title: firstString(raw, ["title", "opportunity_title"]) ?? "Untitled opportunity",
    agency: firstString(raw, ["agency", "agency_name", "department_name"]) ?? "Unknown Agency",
    subAgency: firstString(raw, ["subagency", "sub_agency", "office", "contracting_office"]),
    type: firstString(raw, ["notice_type", "type", "base_type"]) ?? "Solicitation",
    status: explicitlyInactive ? "archived" : "active",
    naicsCode: firstString(raw, ["naics_code", "naics"]),
    postedDate,
    responseDeadline,
    setAside: firstString(raw, ["set_aside", "setaside", "type_of_set_aside"]),
    placeOfPerformance: placeOfPerformance(raw),
    description: firstString(raw, [
      "description_text",
      "description",
      "synopsis",
      "summary",
    ]),
    solicitationNumber: firstString(raw, [
      "solicitation_number",
      "solicitationNumber",
      "solnum",
    ]),
    sourceUrl: sourceUrl(raw, noticeId),
    source: "samGov",
    providerName: "govcon",
    rawData: {
      providerName: "govcon",
      providerFamily: "direct_procurement_api",
      providerType: "govcon_api",
      discoveryMethod: "direct_api",
      sourceConfidence: "high",
      providerNativeId: noticeId,
      evidenceType: "direct-structured",
      dateUnknown: postedDate.getTime() === 0,
      govcon: raw,
    },
  };
}

function queryList(keywords?: string): string[] {
  const requested = keywords?.trim();
  return requested ? [requested] : [...DEFAULT_QUERIES];
}

function upstreamError(status: number, body: string): Error {
  const details = body.replace(/\s+/g, " ").trim().slice(0, 240);
  if (status === 401 || status === 403) {
    return new Error(
      `GovCon API authorization failed (${status}). The configured trial or key may be expired.${details ? ` ${details}` : ""}`,
    );
  }
  if (status === 429) {
    return new Error(
      `GovCon API daily request allowance is exhausted.${details ? ` ${details}` : ""}`,
    );
  }
  return new Error(`GovCon API error ${status}${details ? `: ${details}` : ""}`);
}

export class GovConOpportunityProvider {
  async isConfigured(): Promise<boolean> {
    return configuredToken() !== null;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const token = configuredToken();
    if (!token) {
      throw new Error("GOVCON_API_KEY or GOVCON_AUTH is not configured");
    }

    const today = new Date();
    const requestedDays = Math.max(1, options.dateRange ?? 30);
    const dateRange = Math.min(FREE_SEARCH_WINDOW_DAYS, requestedDays);
    const postedAfter = new Date(today);
    postedAfter.setDate(today.getDate() - dateRange);
    const limit = Math.min(100, Math.max(1, options.limit ?? DEFAULT_QUERY_LIMIT));

    const records: NormalizedOpportunity[] = [];
    const seen = new Set<string>();
    const errors: string[] = [];
    let reportedTotal = 0;

    for (const keywords of queryList(options.keywords)) {
      const url = new URL(`${GOVCON_BASE_URL}/opportunities/search`);
      url.searchParams.set("keywords", keywords);
      url.searchParams.set("posted_after", fmtDate(postedAfter));
      url.searchParams.set("due_after", fmtDate(today));
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", "0");
      url.searchParams.set("sort_by", "posted_date");
      url.searchParams.set("sort_order", "desc");

      const request = composeAbortSignal(REQUEST_TIMEOUT_MS, options.signal);
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: request.signal,
        });
        const body = await response.text();
        if (!response.ok) throw upstreamError(response.status, body);

        let payload: JsonRecord;
        try {
          payload = asRecord(JSON.parse(body));
        } catch {
          throw new Error("GovCon API returned malformed JSON");
        }

        const data = Array.isArray(payload.data) ? payload.data : [];
        const pagination = asRecord(payload.pagination);
        const total = Number(pagination.total);
        if (Number.isFinite(total)) reportedTotal = Math.max(reportedTotal, total);

        for (const item of data) {
          const record = normalize(item);
          if (!record || seen.has(record.externalId)) continue;
          seen.add(record.externalId);
          records.push(record);
        }
      } catch (error) {
        errors.push(
          `${keywords}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        request.cleanup();
      }
    }

    if (records.length === 0 && errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    return {
      records,
      total: reportedTotal || records.length,
      errors,
    };
  }
}

export const govConOpportunityProvider = new GovConOpportunityProvider();
