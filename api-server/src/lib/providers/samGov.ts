import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential, resolveCredentialWithSource, type ResolvedCredential } from "../config/providerConfig";
import { rfpDb as db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { classifyResult } from "../search/relevance";
import { buildSamGovTitleQueries, isBidReadySamOpportunity, type SamOpportunity } from "./samGovQuality";

export { buildSamGovTitleQueries, isBidReadySamOpportunity } from "./samGovQuality";

const SAM_GOV_DEFAULT_BASE = "https://api.sam.gov/opportunities/v2/search";
const SAM_GOV_BID_NOTICE_TYPES = ["o", "k"] as const;

export function formatSamGovApiError(status: number, body: string, credential: Pick<ResolvedCredential, "source" | "key">): string {
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 200);
  const sourceLabel = credential.source === "environment"
    ? `${credential.key} environment variable`
    : `${credential.key} database setting`;

  if (status === 401 && /API_KEY_INVALID/i.test(body)) {
    return `SAM.gov API error 401: API_KEY_INVALID. The rejected key was loaded from the ${sourceLabel}. `
      + `If the key you entered in Settings is correct, check for a stale SAM_GOV_API_KEY deployment secret because environment variables take precedence over database settings.`;
  }

  return `SAM.gov API error ${status}: ${snippet}`;
}

export class SamGovProvider implements DataSourceProvider {
  readonly name = "samGov" as const;

  private async getApiKey(): Promise<string | null> {
    return (await this.getApiKeyCredential())?.value ?? null;
  }

  private async getApiKeyCredential(): Promise<ResolvedCredential | null> {
    return resolveCredentialWithSource("samApiKey", "SAM_GOV_API_KEY");
  }

  private async getBaseUrl(): Promise<string> {
    const custom = await resolveCredential("samBaseUrl", "SAM_GOV_BASE_URL");
    return custom || SAM_GOV_DEFAULT_BASE;
  }

  async isConfigured(): Promise<boolean> {
    const key = await this.getApiKey();
    return !!key;
  }

  private static fmtDate(d: Date): string {
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  }

  /**
   * Run one supported SAM.gov title query and discard non-bid notices before
   * normalization. SAM's public v2 API does not support a `keywords` parameter.
   *
   * Important: do not combine the posted-date window with a separate response-
   * deadline window. SAM.gov validates the earliest and latest dates across the
   * request and rejects a combined span greater than one year. Future response
   * deadlines are filtered locally by isBidReadySamOpportunity instead.
   */
  private async runQuery(
    apiKey: string,
    apiKeySource: ResolvedCredential,
    baseUrl: string,
    extra: Record<string, string>,
    fromDate: Date,
    today: Date,
    limit: number,
    signal?: AbortSignal
  ): Promise<NormalizedOpportunity[]> {
    const params = new URLSearchParams({
      api_key: apiKey,
      postedFrom: SamGovProvider.fmtDate(fromDate),
      postedTo: SamGovProvider.fmtDate(today),
      limit: String(limit),
      offset: "0",
      ...extra,
    });
    SAM_GOV_BID_NOTICE_TYPES.forEach((type) => params.append("ptype", type));

    const response = await fetch(`${baseUrl}?${params}`, { signal });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(formatSamGovApiError(response.status, text, apiKeySource));
    }

    const json = (await response.json()) as { opportunitiesData?: SamOpportunity[]; totalRecords?: number; code?: string; message?: string; nextAccessTime?: string };

    // SAM.gov returns 200 even for quota errors — detect by presence of error code
    if (json.code === "900804" || json.message?.toLowerCase().includes("throttled") || json.message?.toLowerCase().includes("quota")) {
      const resetTime = json.nextAccessTime ?? "soon";
      throw new Error(`SAM.gov daily quota exceeded. API access resets at ${resetTime}. Try again after the reset window.`);
    }

    return (json.opportunitiesData ?? [])
      .filter((opportunity) => isBidReadySamOpportunity(opportunity, today))
      .map((opportunity) => this.normalize(opportunity));
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const apiKeyCredential = await this.getApiKeyCredential();
    if (!apiKeyCredential) throw new Error("SAM_API_KEY_NOT_CONFIGURED");
    const apiKey = apiKeyCredential.value;

    const baseUrl = await this.getBaseUrl();
    const dateRange = Math.max(1, Math.min(364, options.dateRange ?? 30));
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - dateRange);
    const limit = options.limit ?? 100;

    const normalized: NormalizedOpportunity[] = [];
    const seen = new Set<string>();
    for (const title of buildSamGovTitleQueries(options.keywords)) {
      const matches = await this.runQuery(apiKey, apiKeyCredential, baseUrl, { title }, fromDate, today, limit, options.signal);
      for (const opportunity of matches) {
        if (seen.has(opportunity.externalId)) continue;
        seen.add(opportunity.externalId);
        normalized.push(opportunity);
      }
    }

    const relevant = normalized.flatMap((opportunity) => {
      const relevance = classifyResult({
        title: opportunity.title,
        snippet: [
          opportunity.type,
          opportunity.description,
          opportunity.agency,
          opportunity.subAgency,
          opportunity.naicsCode,
          opportunity.naicsDescription,
        ].filter(Boolean).join(" "),
        url: opportunity.sourceUrl,
        date: opportunity.postedDate,
        deadlineInFuture: Boolean(opportunity.responseDeadline && opportunity.responseDeadline > today),
        allowHistorical: true,
      });
      if (relevance.rejected || relevance.score < 65 || relevance.confidence === "possible_adjacent") return [];
      return [{
        ...opportunity,
        rawData: {
          ...(opportunity.rawData ?? {}),
          relevanceScore: relevance.score,
          relevanceReason: relevance.reasons.join("; "),
          relevanceConfidence: relevance.confidence,
        },
      }];
    });

    const noMatchWarning = relevant.length === 0 && normalized.length > 0
      ? ["SAM.gov returned bid-ready notices, but none had a strong current match to Occu-Med service lines."]
      : [];

    return {
      records: relevant,
      total: normalized.length,
      errors: noMatchWarning,
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    let recordCount: number | undefined;

    if (configured) {
      try {
        const rows = await db
          .select({ count: sql<number>`count(*)` })
          .from(opportunitiesTable)
          .where(eq(opportunitiesTable.source, "sam_gov"));
        recordCount = Number(rows[0]?.count ?? 0);
      } catch {
        // DB may not be migrated yet — record count is non-critical
      }
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
      postedDate: o.postedDate ? new Date(o.postedDate) : new Date(0),
      responseDeadline: o.responseDeadLine ? new Date(o.responseDeadLine) : undefined,
      setAside: o.typeOfSetAsideDescription ?? o.typeOfSetAside,
      placeOfPerformance: place,
      // SAM.gov 'description' field is often just an API URL — strip it and use a real summary
      description: (() => {
        const d = o.description ?? "";
        if (!d || d.startsWith("https://api.sam.gov")) {
          // Build a meaningful description from available fields
          const parts: string[] = [];
          if (o.solicitationNumber) parts.push(`Solicitation: ${o.solicitationNumber}`);
          if (o.typeOfSetAsideDescription) parts.push(`Set-aside: ${o.typeOfSetAsideDescription}`);
          if (o.naicsCode) parts.push(`NAICS: ${o.naicsCode}`);
          if (o.classificationCode) parts.push(`PSC: ${o.classificationCode}`);
          if (o.award?.awardee?.name) parts.push(`Awardee: ${o.award.awardee.name}`);
          if (o.officeAddress?.city) parts.push(`Location: ${o.officeAddress.city}, ${o.officeAddress.state}`);
          return parts.length > 0 ? parts.join(" · ") : undefined;
        }
        return d;
      })(),
      solicitationNumber: o.solicitationNumber,
      sourceUrl: o.noticeId ? `https://sam.gov/opp/${o.noticeId}/view` : o.uiLink,
      awardAmount,
      awardee: o.award?.awardee?.name,
      source: this.name,
      rawData: {
        ...(o as Record<string, unknown>),
        providerPlatform: "sam.gov",
        providerNativeId: o.noticeId,
        evidenceType: "direct-structured",
        ...(!o.postedDate || Number.isNaN(new Date(o.postedDate).getTime()) ? { dateUnknown: true } : {}),
      },
    };
  }
}

export const samGovProvider = new SamGovProvider();
