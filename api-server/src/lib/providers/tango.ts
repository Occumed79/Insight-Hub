/**
 * Tango Provider (Procurement Intelligence)
 *
 * Uses the Tango by MakeGov REST API:
 *   Base URL: https://tango.makegov.com/api/  (override via TANGO_BASE_URL)
 *   Auth:     X-API-KEY header
 *   Endpoint: GET /opportunities/
 *   Docs:     https://docs.makegov.com/api-reference/opportunities/
 */

import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const TANGO_DEFAULT_BASE = "https://tango.makegov.com/api/";
const UNKNOWN_POSTED_DATE = new Date(0);

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

export class TangoProvider implements DataSourceProvider {
  readonly name = "tango" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("tangoApiKey", "TANGO_API_KEY");
  }

  private async getBaseUrl(): Promise<string> {
    const custom = await resolveCredential("tangoBaseUrl", "TANGO_BASE_URL");
    return custom || TANGO_DEFAULT_BASE;
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  private static fmtDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  private normalize(o: TangoOpportunity): NormalizedOpportunity {
    const placeParts: string[] = [];
    const pop = o.place_of_performance;
    if (pop) {
      if (pop.city) placeParts.push(pop.city);
      if (pop.state) placeParts.push(pop.state);
      if (pop.country && pop.country !== "United States" && pop.country !== "USA") placeParts.push(pop.country);
    }
    const postedDate = parsedDate(o.first_notice_date);

    return {
      externalId: o.opportunity_id,
      title: o.title || "Untitled Opportunity",
      agency: o.office?.agency_name || "Unknown Agency",
      subAgency: o.office?.department_name || undefined,
      type: o.set_aside || "Unknown",
      status: o.active ? "active" : "archived",
      naicsCode: o.naics_code || undefined,
      postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
      responseDeadline: parsedDate(o.response_deadline),
      setAside: o.set_aside || undefined,
      placeOfPerformance: placeParts.length > 0 ? placeParts.join(", ") : undefined,
      description: o.description || undefined,
      solicitationNumber: o.solicitation_number || undefined,
      sourceUrl: o.sam_url || undefined,
      source: this.name,
      providerName: this.name,
      rawData: {
        providerName: "tango",
        providerFamily: "direct_procurement_api",
        providerType: "tango_makegov_api",
        discoveryMethod: "direct_api",
        sourceConfidence: "high",
        dateUnknown: !postedDate,
        tags: [
          "direct-api",
          "tango",
          ...(!postedDate ? ["date-unknown"] : []),
        ],
        notes: "Collected directly from the configured Tango by MakeGov opportunity API.",
        tango: o,
      },
    };
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error("Tango API key not configured. Set TANGO_API_KEY in environment or Settings.");
    }

    const baseUrl = await this.getBaseUrl();
    const today = new Date();
    const dateRange = options.dateRange ?? 30;
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - dateRange);
    const limit = options.limit ?? 50;

    const params = new URLSearchParams({
      first_notice_date_after: TangoProvider.fmtDate(fromDate),
      first_notice_date_before: TangoProvider.fmtDate(today),
      limit: String(limit),
      page: "1",
      ordering: "-first_notice_date",
    });

    if (options.keywords?.trim()) {
      params.set("search", options.keywords.trim());
    }

    const url = `${baseUrl}opportunities/?${params}`;
    const response = await fetch(url, {
      headers: { "X-API-KEY": apiKey },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Tango API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = (await response.json()) as TangoListResponse;
    const records = (json.results ?? []).map((o) => this.normalize(o));

    return {
      records,
      total: json.count ?? records.length,
      errors: [],
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
