/**
 * Tango Provider (Procurement Intelligence)
 *
 * Uses the Tango by MakeGov REST API:
 *   Base URL: https://tango.makegov.com/api/  (override via TANGO_BASE_URL)
 *   Auth:     X-API-KEY header
 *   Endpoint: GET /opportunities/
 *   Docs:     https://docs.makegov.com/api-reference/opportunities/
 */

import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { resolveCredential } from "../config/providerConfig";

const TANGO_DEFAULT_BASE = "https://tango.makegov.com/api/";
const UNKNOWN_POSTED_DATE = new Date(0);
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RECORD_LIMIT = 500;
const MAX_PAGE_SIZE = 100;

interface TangoOpportunity {
  opportunity_id: string;
  title?: string;
  active?: boolean;
  first_notice_date?: string;
  last_notice_date?: string;
  response_deadline?: string;
  naics_code?: string;
  psc_code?: string;
  office?: {
    agency_name?: string;
    department_name?: string;
  } | null;
  place_of_performance?: {
    city?: string;
    state?: string;
    country?: string;
  } | null;
  sam_url?: string;
  set_aside?: string;
  solicitation_number?: string;
  description?: string;
}

interface TangoListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: TangoOpportunity[];
}

function parsedDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function integerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return Math.min(10_000, Math.max(250, seconds * 1000));
    }
    const retryAt = new Date(retryAfter).getTime();
    if (Number.isFinite(retryAt)) {
      return Math.min(10_000, Math.max(250, retryAt - Date.now()));
    }
  }
  return Math.min(5_000, 500 * 2 ** attempt);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class TangoProvider implements DataSourceProvider {
  readonly name = "tango" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("tangoApiKey", "TANGO_API_KEY");
  }

  private async getBaseUrl(): Promise<string> {
    const custom = await resolveCredential("tangoBaseUrl", "TANGO_BASE_URL");
    const configured = custom || TANGO_DEFAULT_BASE;
    return configured.endsWith("/") ? configured : `${configured}/`;
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  private static fmtDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  private normalize(
    opportunity: TangoOpportunity,
    pageNumber: number,
  ): NormalizedOpportunity {
    const placeParts: string[] = [];
    const place = opportunity.place_of_performance;
    if (place) {
      if (place.city) placeParts.push(place.city);
      if (place.state) placeParts.push(place.state);
      if (
        place.country &&
        place.country !== "United States" &&
        place.country !== "USA"
      ) {
        placeParts.push(place.country);
      }
    }
    const postedDate = parsedDate(opportunity.first_notice_date);

    return {
      externalId: opportunity.opportunity_id,
      title: opportunity.title || "Untitled Opportunity",
      agency: opportunity.office?.agency_name || "Unknown Agency",
      subAgency: opportunity.office?.department_name || undefined,
      type: opportunity.set_aside || "Unknown",
      status: opportunity.active ? "active" : "archived",
      naicsCode: opportunity.naics_code || undefined,
      postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
      responseDeadline: parsedDate(opportunity.response_deadline),
      setAside: opportunity.set_aside || undefined,
      placeOfPerformance:
        placeParts.length > 0 ? placeParts.join(", ") : undefined,
      description: opportunity.description || undefined,
      solicitationNumber: opportunity.solicitation_number || undefined,
      sourceUrl: opportunity.sam_url || undefined,
      source: this.name,
      providerName: this.name,
      rawData: {
        providerName: "tango",
        providerFamily: "direct_procurement_api",
        providerType: "tango_makegov_api",
        discoveryMethod: "direct_api",
        sourceConfidence: "high",
        dateUnknown: !postedDate,
        listingPageNumber: pageNumber,
        paginationMode: "bounded_api_next_link",
        tags: [
          "direct-api",
          "tango",
          ...(!postedDate ? ["date-unknown"] : []),
        ],
        notes:
          "Collected directly from the configured Tango by MakeGov opportunity API using bounded pagination.",
        tango: opportunity,
      },
    };
  }

  private async fetchPage(
    url: URL,
    apiKey: string,
    allowedOrigin: string,
    timeoutMs: number,
    maxRetries: number,
  ): Promise<TangoListResponse> {
    if (url.origin !== allowedOrigin) {
      throw new Error(
        `Tango API returned a pagination URL outside the configured API origin: ${url.origin}`,
      );
    }

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          headers: {
            "X-API-KEY": apiKey,
            accept: "application/json",
          },
          signal: controller.signal,
        });

        if (response.ok) {
          const payload = (await response.json()) as TangoListResponse;
          return {
            count: Number.isFinite(payload.count) ? payload.count : 0,
            next: typeof payload.next === "string" ? payload.next : null,
            previous:
              typeof payload.previous === "string" ? payload.previous : null,
            results: Array.isArray(payload.results) ? payload.results : [],
          };
        }

        const responseText = await response.text().catch(() => "");
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < maxRetries) {
          await wait(retryDelayMs(response, attempt));
          continue;
        }

        throw new Error(
          `Tango API error ${response.status}: ${responseText.slice(0, 200)}`,
        );
      } catch (error) {
        const timedOut = controller.signal.aborted;
        if (attempt < maxRetries && (timedOut || error instanceof TypeError)) {
          await wait(Math.min(5_000, 500 * 2 ** attempt));
          continue;
        }
        if (timedOut) {
          throw new Error(`Tango API request timed out after ${timeoutMs}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new Error("Tango API request failed after retry limit");
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error(
        "Tango API key not configured. Set TANGO_API_KEY in environment or Settings.",
      );
    }

    const baseUrl = await this.getBaseUrl();
    const endpoint = new URL("opportunities/", baseUrl);
    const allowedOrigin = endpoint.origin;
    const today = new Date();
    const dateRange = Math.max(1, options.dateRange ?? 30);
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - dateRange);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, options.limit ?? 50),
    );
    const maxPages = integerEnv(
      "TANGO_MAX_PAGES",
      DEFAULT_MAX_PAGES,
      1,
      25,
    );
    const recordLimit = Math.min(MAX_RECORD_LIMIT, pageSize * maxPages);
    const timeoutMs = integerEnv(
      "TANGO_REQUEST_TIMEOUT_MS",
      DEFAULT_REQUEST_TIMEOUT_MS,
      2_000,
      120_000,
    );
    const maxRetries = integerEnv(
      "TANGO_MAX_RETRIES",
      DEFAULT_MAX_RETRIES,
      0,
      5,
    );

    endpoint.searchParams.set(
      "first_notice_date_after",
      TangoProvider.fmtDate(fromDate),
    );
    endpoint.searchParams.set(
      "first_notice_date_before",
      TangoProvider.fmtDate(today),
    );
    endpoint.searchParams.set("limit", String(pageSize));
    endpoint.searchParams.set("page", "1");
    endpoint.searchParams.set("ordering", "-first_notice_date");
    if (options.keywords?.trim()) {
      endpoint.searchParams.set("search", options.keywords.trim());
    }

    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];
    const seenOpportunityIds = new Set<string>();
    const seenPageUrls = new Set<string>();
    let currentUrl: URL | null = endpoint;
    let pageNumber = 0;
    let reportedTotal = 0;

    while (
      currentUrl &&
      pageNumber < maxPages &&
      records.length < recordLimit
    ) {
      const pageKey = currentUrl.toString();
      if (seenPageUrls.has(pageKey)) {
        errors.push("Tango pagination stopped because the API repeated a page URL.");
        break;
      }
      seenPageUrls.add(pageKey);
      pageNumber += 1;

      let page: TangoListResponse;
      try {
        page = await this.fetchPage(
          currentUrl,
          apiKey,
          allowedOrigin,
          timeoutMs,
          maxRetries,
        );
      } catch (error) {
        if (records.length === 0) throw error;
        errors.push(
          `Tango page ${pageNumber} failed after ${records.length} records were retained: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        break;
      }

      reportedTotal = Math.max(reportedTotal, page.count || 0);
      for (const opportunity of page.results) {
        if (!opportunity?.opportunity_id) continue;
        if (seenOpportunityIds.has(opportunity.opportunity_id)) continue;
        seenOpportunityIds.add(opportunity.opportunity_id);
        records.push(this.normalize(opportunity, pageNumber));
        if (records.length >= recordLimit) break;
      }

      if (!page.next || records.length >= recordLimit) {
        currentUrl = null;
      } else {
        currentUrl = new URL(page.next, currentUrl);
      }
    }

    if (currentUrl && pageNumber >= maxPages) {
      errors.push(
        `Tango pagination stopped at the configured ${maxPages}-page limit.`,
      );
    }

    return {
      records,
      total: reportedTotal || records.length,
      errors,
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return {
      name: this.name,
      configured,
      healthy: configured,
    };
  }
}

export const tangoProvider = new TangoProvider();
