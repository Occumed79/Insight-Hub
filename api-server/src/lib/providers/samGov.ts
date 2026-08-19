import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential, resolveCredentialWithSource, type ResolvedCredential } from "../config/providerConfig";
import { rfpDb as db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  buildSamGovAutonomousTitleQueries,
  buildSamGovTitleQueries,
  isBidReadySamOpportunity,
  type SamOpportunity,
} from "./samGovQuality";

export { buildSamGovAutonomousTitleQueries, buildSamGovTitleQueries, isBidReadySamOpportunity } from "./samGovQuality";

const SAM_GOV_DEFAULT_BASE = "https://api.sam.gov/opportunities/v2/search";
const SAM_GOV_BID_NOTICE_TYPES = ["o", "k"] as const;
const SAM_GOV_MAX_RESULTS_PER_TITLE = 250;
const SAM_GOV_AUTONOMOUS_QUERY_COUNT = 2;
const SAM_GOV_HYDRATION_LIMIT = 16;
const SAM_GOV_HYDRATION_CONCURRENCY = 2;
let autonomousQueryCursor = 0;

export function formatSamGovApiError(
  status: number,
  body: string,
  credential: Pick<ResolvedCredential, "source" | "key">,
): string {
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 200);
  const sourceLabel = credential.source === "environment"
    ? `${credential.key} environment variable`
    : `${credential.key} database setting`;
  if (status === 401 && /API_KEY_INVALID/i.test(body)) {
    return `SAM.gov API error 401: API_KEY_INVALID. The rejected key was loaded from the ${sourceLabel}. If the key you entered in Settings is correct, check for a stale SAM_GOV_API_KEY deployment secret because environment variables take precedence over database settings.`;
  }
  return `SAM.gov API error ${status}: ${snippet}`;
}

export function isOfficialSamOpportunityUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return (host === "sam.gov" || host.endsWith(".sam.gov")) && /^\/opp\/[^/]+\/view\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
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
    return (await resolveCredential("samBaseUrl", "SAM_GOV_BASE_URL")) || SAM_GOV_DEFAULT_BASE;
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  private static fmtDate(date: Date): string {
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
  }

  private async runQuery(
    apiKey: string,
    apiKeySource: ResolvedCredential,
    baseUrl: string,
    extra: Record<string, string>,
    fromDate: Date,
    today: Date,
    limit: number,
    signal?: AbortSignal,
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
    const json = (await response.json()) as {
      opportunitiesData?: SamOpportunity[];
      totalRecords?: number;
      code?: string;
      message?: string;
      nextAccessTime?: string;
    };
    if (
      json.code === "900804" ||
      json.message?.toLowerCase().includes("throttled") ||
      json.message?.toLowerCase().includes("quota")
    ) {
      const resetTime = json.nextAccessTime ?? "soon";
      throw new Error(`SAM.gov daily quota exceeded. API access resets at ${resetTime}. Try again after the reset window.`);
    }
    return (json.opportunitiesData ?? [])
      .filter((opportunity) => isBidReadySamOpportunity(opportunity, today))
      .map((opportunity) => this.normalize(opportunity));
  }

  private async hydrateDescriptions(
    records: NormalizedOpportunity[],
    signal?: AbortSignal,
  ): Promise<{ records: NormalizedOpportunity[]; hydratedCount: number }> {
    const candidates = records
      .filter((record) => typeof record.rawData?.samDescriptionUrl === "string" && !!record.sourceUrl)
      .slice(0, SAM_GOV_HYDRATION_LIMIT);
    if (candidates.length === 0) return { records, hydratedCount: 0 };
    const { jinaProvider } = await import("./jina");
    const hydrated = new Map<string, string>();
    for (let index = 0; index < candidates.length; index += SAM_GOV_HYDRATION_CONCURRENCY) {
      const batch = candidates.slice(index, index + SAM_GOV_HYDRATION_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (record) => ({
          id: record.externalId,
          text: record.sourceUrl ? await jinaProvider.extractUrl(record.sourceUrl, 6_000, signal) : null,
        })),
      );
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.text && result.value.text.trim().length >= 120) {
          hydrated.set(result.value.id, result.value.text.trim());
        }
      }
    }
    return {
      hydratedCount: hydrated.size,
      records: records.map((record) => {
        const description = hydrated.get(record.externalId);
        return description
          ? {
              ...record,
              description,
              rawData: {
                ...(record.rawData ?? {}),
                descriptionHydratedBy: "jina-reader",
                descriptionHydratedFrom: record.sourceUrl,
              },
            }
          : record;
      }),
    };
  }

  private titleQueriesForRun(keywords?: string): string[] {
    const explicit = buildSamGovTitleQueries(keywords);
    if (explicit.length > 0) return explicit.slice(0, 2);
    const queries = buildSamGovAutonomousTitleQueries(autonomousQueryCursor, SAM_GOV_AUTONOMOUS_QUERY_COUNT);
    autonomousQueryCursor = (autonomousQueryCursor + SAM_GOV_AUTONOMOUS_QUERY_COUNT) % 8;
    return queries;
  }

  private async recoverOfficialSamPages(
    options: FetchOptions,
    titleQueries: string[],
  ): Promise<NormalizedOpportunity[]> {
    const quotedFocus = titleQueries
      .filter(Boolean)
      .map((title) => `"${title.replace(/"/g, "")}"`)
      .join(" OR ");
    const samSearch = [
      "site:sam.gov/opp/ inurl:/view",
      quotedFocus ? `(${quotedFocus})` : "(occupational OR medical OR health OR testing OR surveillance)",
      '(solicitation OR "combined synopsis/solicitation")',
    ].join(" ");

    try {
      const { webIntelligenceFetch } = await import("../search/webIntelligence");
      const result = await webIntelligenceFetch({
        keywords: options.keywords,
        discoveryQueries: [samSearch],
        candidateUrlFilter: isOfficialSamOpportunityUrl,
        dateRange: options.dateRange,
        useYou: true,
        useBrowserbase: true,
        useKeenable: true,
        useParallel: true,
        useExa: true,
        useFirecrawl: true,
        useLangsearch: true,
        useLinkup: true,
        useSocrata: false,
        useWebsearch: true,
        useRssAggregator: false,
        useSelfHostedSearch: false,
        useSelfHostedCrawler: false,
        discoveryPoolId: "sam-gov-zero-result-recovery",
        signal: options.signal,
      });
      const records = result.opportunities
        .filter((record) => isOfficialSamOpportunityUrl(record.sourceUrl))
        .map((record) => ({
          ...record,
          source: "samGov" as const,
          rawData: {
            ...(record.rawData ?? {}),
            providerName: "samGovPublicSearch",
            evidenceType: "discovery",
            samGovKeylessFallback: true,
            samGovFallbackReason: "structured-zero-results",
          },
        }));
      if (records.length > 0) {
        console.warn(JSON.stringify({ event: "sam_gov_zero_result_recovered", titleQueries, recovered: records.length }));
      }
      return records;
    } catch (error) {
      console.warn(JSON.stringify({
        event: "sam_gov_zero_result_recovery_failed",
        titleQueries,
        error: error instanceof Error ? error.message : String(error),
      }));
      return [];
    }
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const apiKeyCredential = await this.getApiKeyCredential();
    if (!apiKeyCredential) throw new Error("SAM_API_KEY_NOT_CONFIGURED");
    const baseUrl = await this.getBaseUrl();
    const dateRange = Math.max(1, Math.min(364, options.dateRange ?? 30));
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - dateRange);
    const limit = Math.max(1, Math.min(options.limit ?? 100, SAM_GOV_MAX_RESULTS_PER_TITLE));
    const normalized: NormalizedOpportunity[] = [];
    const seen = new Set<string>();
    const titleQueries = this.titleQueriesForRun(options.keywords);

    for (const title of titleQueries) {
      const matches = await this.runQuery(
        apiKeyCredential.value,
        apiKeyCredential,
        baseUrl,
        { title },
        fromDate,
        today,
        limit,
        options.signal,
      );
      for (const opportunity of matches) {
        if (!opportunity.externalId || seen.has(opportunity.externalId)) continue;
        seen.add(opportunity.externalId);
        normalized.push(opportunity);
      }
    }

    if (normalized.length === 0) {
      const recovered = await this.recoverOfficialSamPages(options, titleQueries);
      return {
        records: recovered,
        total: recovered.length,
        errors: recovered.length > 0
          ? [`SAM.gov structured title queries returned no bid-ready records; recovered ${recovered.length} official SAM.gov opportunity pages through renewable web discovery.`]
          : [],
        diagnostics: {
          queryCount: titleQueries.length,
          queries: titleQueries,
          targetedQueries: true,
          structuredMatches: 0,
          recoveryUsed: true,
          recovered: recovered.length,
          hydrationProvider: "jina-reader",
          hydratedCount: 0,
        },
      };
    }

    const hydrated = await this.hydrateDescriptions(normalized, options.signal);
    return {
      records: hydrated.records,
      total: hydrated.records.length,
      errors: [],
      diagnostics: {
        queryCount: titleQueries.length,
        queries: titleQueries,
        targetedQueries: true,
        structuredMatches: normalized.length,
        recoveryUsed: false,
        recovered: 0,
        hydrationProvider: "jina-reader",
        hydratedCount: hydrated.hydratedCount,
      },
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
      } catch {}
    }
    return { name: this.name, configured, healthy: configured, recordCount };
  }

  private normalize(opportunity: SamOpportunity): NormalizedOpportunity {
    const parts = (opportunity.fullParentPathName ?? "").split(".");
    const city = opportunity.placeOfPerformance?.city?.name ?? "";
    const state = opportunity.placeOfPerformance?.state?.code ?? "";
    const place = [city, state].filter(Boolean).join(", ") || undefined;
    const awardAmount = opportunity.award?.amount
      ? parseFloat(String(opportunity.award.amount))
      : undefined;
    const originalDescription = opportunity.description?.trim() ?? "";
    const descriptionIsUrl = /^https?:\/\//i.test(originalDescription);
    const metadata: string[] = [];
    if (opportunity.solicitationNumber) metadata.push(`Solicitation: ${opportunity.solicitationNumber}`);
    if (opportunity.typeOfSetAsideDescription) metadata.push(`Set-aside: ${opportunity.typeOfSetAsideDescription}`);
    if (opportunity.naicsCode) metadata.push(`NAICS: ${opportunity.naicsCode}`);
    if (opportunity.classificationCode) metadata.push(`PSC: ${opportunity.classificationCode}`);
    if (opportunity.officeAddress?.city) metadata.push(`Location: ${opportunity.officeAddress.city}, ${opportunity.officeAddress.state ?? ""}`);

    return {
      externalId: opportunity.noticeId ?? opportunity.solicitationNumber ?? "",
      title: opportunity.title ?? "Untitled",
      agency: parts[0]?.trim() ?? "Unknown Agency",
      subAgency: parts[1]?.trim(),
      type: opportunity.type ?? opportunity.baseType ?? "Solicitation",
      status: opportunity.active === "Yes" ? "active" : "archived",
      naicsCode: opportunity.naicsCode,
      postedDate: opportunity.postedDate ? new Date(opportunity.postedDate) : new Date(0),
      responseDeadline: opportunity.responseDeadLine ? new Date(opportunity.responseDeadLine) : undefined,
      setAside: opportunity.typeOfSetAsideDescription ?? opportunity.typeOfSetAside,
      placeOfPerformance: place,
      description: originalDescription && !descriptionIsUrl ? originalDescription : (metadata.length > 0 ? metadata.join(" · ") : undefined),
      solicitationNumber: opportunity.solicitationNumber,
      sourceUrl: opportunity.noticeId ? `https://sam.gov/opp/${opportunity.noticeId}/view` : opportunity.uiLink,
      awardAmount,
      awardee: opportunity.award?.awardee?.name,
      source: this.name,
      rawData: {
        ...(opportunity as Record<string, unknown>),
        providerPlatform: "sam.gov",
        providerNativeId: opportunity.noticeId,
        evidenceType: "direct-structured",
        ...(descriptionIsUrl ? { samDescriptionUrl: originalDescription } : {}),
        ...(!opportunity.postedDate || Number.isNaN(new Date(opportunity.postedDate).getTime()) ? { dateUnknown: true } : {}),
      },
    };
  }
}

export const samGovProvider = new SamGovProvider();