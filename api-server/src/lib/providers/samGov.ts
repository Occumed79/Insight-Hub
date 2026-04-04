import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";
import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const SAM_GOV_DEFAULT_BASE = "https://api.sam.gov/opportunities/v2/search";

interface SamOpportunity {
  noticeId?: string;
  title?: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  type?: string;
  baseType?: string;
  active?: string;
  naicsCode?: string;
  postedDate?: string;
  responseDeadLine?: string;
  typeOfSetAside?: string;
  typeOfSetAsideDescription?: string;
  placeOfPerformance?: { city?: { name?: string }; state?: { code?: string } };
  description?: string;
  uiLink?: string;
  award?: { amount?: number | string; awardee?: { name?: string } };
}

export class SamGovProvider implements DataSourceProvider {
  readonly name = "samGov" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("samApiKey", "SAM_GOV_API_KEY");
  }

  private async getBaseUrl(): Promise<string> {
    const custom = await resolveCredential("samBaseUrl", "SAM_GOV_BASE_URL");
    return custom || SAM_GOV_DEFAULT_BASE;
  }

  async isConfigured(): Promise<boolean> {
    const key = await this.getApiKey();
    return !!key;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("SAM_API_KEY_NOT_CONFIGURED");

    const baseUrl = await this.getBaseUrl();
    const dateRange = options.dateRange ?? 30;
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - dateRange);

    const fmt = (d: Date) =>
      `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

    const params = new URLSearchParams({
      api_key: apiKey,
      postedFrom: fmt(fromDate),
      postedTo: fmt(today),
      limit: String(options.limit ?? 100),
      offset: String(options.offset ?? 0),
    });

    if (options.keywords?.trim()) params.set("keywords", options.keywords.trim());

    const response = await fetch(`${baseUrl}?${params}`);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`SAM.gov API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = (await response.json()) as { opportunitiesData?: SamOpportunity[]; totalRecords?: number; code?: string; message?: string; nextAccessTime?: string };

    // SAM.gov returns 200 even for quota errors — detect by presence of error code
    if (json.code === "900804" || json.message?.toLowerCase().includes("throttled") || json.message?.toLowerCase().includes("quota")) {
      const resetTime = json.nextAccessTime ?? "soon";
      throw new Error(`SAM.gov daily quota exceeded. API access resets at ${resetTime}. Try again after the reset window.`);
    }

    const opps = json.opportunitiesData ?? [];

    return {
      records: opps.map((o) => this.normalize(o)),
      total: json.totalRecords ?? opps.length,
      errors: [],
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    let recordCount: number | undefined;

    if (configured) {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(opportunitiesTable)
        .where(eq(opportunitiesTable.source, "sam_gov"));
      recordCount = Number(rows[0]?.count ?? 0);
    }

    return { name: this.name, configured, healthy: configured, recordCount };
  }

  private normalize(o: SamOpportunity): NormalizedOpportunity {
    const parts = (o.fullParentPathName ?? "").split(".");
    const city = o.placeOfPerformance?.city?.name ?? "";
    const state = o.placeOfPerformance?.state?.code ?? "";
    const place = [city, state].filter(Boolean).join(", ") || undefined;
    const awardAmount = o.award?.amount ? parseFloat(String(o.award.amount)) : undefined;

    return {
      externalId: o.noticeId ?? o.solicitationNumber ?? "",
      title: o.title ?? "Untitled",
      agency: parts[0]?.trim() ?? "Unknown Agency",
      subAgency: parts[1]?.trim(),
      type: o.type ?? o.baseType ?? "Solicitation",
      status: o.active === "Yes" ? "active" : "archived",
      naicsCode: o.naicsCode,
      postedDate: o.postedDate ? new Date(o.postedDate) : new Date(),
      responseDeadline: o.responseDeadLine ? new Date(o.responseDeadLine) : undefined,
      setAside: o.typeOfSetAsideDescription ?? o.typeOfSetAside,
      placeOfPerformance: place,
      description: o.description,
      solicitationNumber: o.solicitationNumber,
      sourceUrl: o.uiLink,
      awardAmount,
      awardee: o.award?.awardee?.name,
      source: this.name,
      rawData: o as Record<string, unknown>,
    };
  }
}

export const samGovProvider = new SamGovProvider();
