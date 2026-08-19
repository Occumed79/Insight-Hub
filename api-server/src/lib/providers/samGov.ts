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

export {
  buildSamGovAutonomousTitleQueries,
  buildSamGovTitleQueries,
  isBidReadySamOpportunity,
} from "./samGovQuality";

const SAM_GOV_DEFAULT_BASE = "https://api.sam.gov/opportunities/v2/search";
const SAM_GOV_BID_NOTICE_TYPES = ["o", "k"] as const;
const SAM_GOV_MAX_RESULTS_PER_TITLE = 250;
const SAM_GOV_AUTONOMOUS_QUERY_COUNT = 2;
const SAM_GOV_HYDRATION_LIMIT = 16;
const SAM_GOV_HYDRATION_CONCURRENCY = 2;
let autonomousQueryCursor = 0;

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
    return !!(await this.getApiKey());
  }

  private static fmtDate(d: Date): string {
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  }

  /**
   * Run one supported SAM.gov title query and discard only notices that are not
   * structurally bid-ready. Semantic Occu-Med relevance is intentionally left
   * to the shared structured decision layer after content hydration.
   */
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
  ): Promise<NormalizedOpportunity[]> {
    const candidates = records
      .filter((record) => {
        const originalDescription = record.rawData?.samDescriptionUrl;
        return typeof originalDescription === "string" && !!record.sourceUrl;
      })
      .slice(0, SAM_GOV_HYDRATION_LIMIT);
    if (candidates.length === 0) return records;

    const { jinaProvider } = await import("./jina");
    const hydrated = new Map<string, string>();

    for (let index = 0; index < candidates.length; index += SAM_GOV_HYDRATION_CONCURRENCY) {
      const batch = candidates.slice(index, index + SAM_GOV_HYDRATION_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (record) => ({
          id: record.externalId,
          text: record.sourceUrl
            ? await jinaProvider.extractUrl(record.sourceUrl, 6_000, signal)
            : null,
        })),
      );
      for (const result of results) {
        if (
          result.status === "fulfilled" &&
          result.value.text &&
          result.value.text.trim().length >= 120
        ) {
          hydrated.set(result.value.id, result.value.text.trim());
        }
      }
    }

    return records.map((record) => {
      const description = hydrated.get(record.externalId);
      if (!description) return record;
      return {
        ...record,
        description,
        rawData: {
          ...(record.rawData ?? {}),
          descriptionHydratedBy: "jina-reader",
          descriptionHydratedFrom: record.sourceUrl,
        },
      };
    });
  }

  private titleQueriesForRun(keywords?: string): string[] {
    const explicit = buildSamGovTitleQueries(keywords);
    if (explicit.length > 0) return explicit.slice(0, 2);

    const queries = buildSamGovAutonomousTitleQueries(
      autonomousQueryCursor,
      SAM_GOV_AUTONOMOUS_QUERY_COUNT,
    );
    autonomousQueryCursor =
      (autonomousQueryCursor + SAM_GOV_AUTONOMOUS_QUERY_COUNT) % 8;
    return queries;
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
    const limit = Math.max(
      1,
      Math.min(options.limit ?? 100, SAM_GOV_MAX_RESULTS_PER_TITLE),
    );

    const normalized: NormalizedOpportunity[] = [];
    const seen = new Set<string>();
    const titleQueries = this.titleQueriesForRun(options.keywords);

    for (const title of titleQueries) {
      const matches = await this.runQuery(
        apiKey,
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

    const hydrated = await this.hydrateDescriptions(normalized, options.signal);

    return {
      records: hydrated,
      total: hydrated.length,
      errors: [],
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
        // DB may not be migrated yet — record count is non-critical.
      }
    }

    return { name: this.name, configured, healthy: configured, recordCount };
  }

  private normalize(o: SamOpportunity): NormalizedOpportunity {
    const parts = (o.fullParentPathName ?? "").split(".");
    const city = o.placeOfPerformance?.city?.name ?? "";
    const state = o.placeOfPerformance?.state?.code ?? "";
    const place = [city, state].filter(Boolean).join(", ") || undefined;
    const awardAmount = o.award?.amount
      ? parseFloat(String(o.award.amount))
      : undefined;
    const originalDescription = o.description?.trim() ?? "";
    const descriptionIsUrl = /^https?:\/\//i.test(originalDescription);

    const metadataDescription = (() => {
      const metadata: string[] = [];
      if (o.solicitationNumber) metadata.push(`Solicitation: ${o.solicitationNumber}`);
      if (o.typeOfSetAsideDescription) metadata.push(`Set-aside: ${o.typeOfSetAsideDescription}`);
      if (o.naicsCode) metadata.push(`NAICS: ${o.naicsCode}`);
      if (o.classificationCode) metadata.push(`PSC: ${o.classificationCode}`);
      if (o.officeAddress?.city) metadata.push(`Location: ${o.officeAddress.city}, ${o.officeAddress.state ?? ""}`);
      return metadata.length > 0 ? metadata.join(" · ") : undefined;
    })();

    return {
      externalId: o.noticeId ?? o.solicitationNumber ?? "",
      title: o.title ?? "Untitled",
      agency: parts[0]?.trim() ?? "Unknown Agency",
      subAgency: parts[1]?.trim(),
      type: o.type ?? o.baseType ?? "Solicitation",
      status: o.active === "Yes" ? "active" : "archived",
      naicsCode: o.naicsCode,
      postedDate: o.postedDate ? new Date(o.postedDate) : new Date(0),
      responseDeadline: o.responseDeadLine
        ? new Date(o.responseDeadLine)
        : undefined,
      setAside: o.typeOfSetAsideDescription ?? o.typeOfSetAside,
      placeOfPerformance: place,
      description:
        originalDescription && !descriptionIsUrl
          ? originalDescription
          : metadataDescription,
      solicitationNumber: o.solicitationNumber,
      sourceUrl: o.noticeId
        ? `https://sam.gov/opp/${o.noticeId}/view`
        : o.uiLink,
      awardAmount,
      awardee: o.award?.awardee?.name,
      source: this.name,
      rawData: {
        ...(o as Record<string, unknown>),
        providerPlatform: "sam.gov",
        providerNativeId: o.noticeId,
        evidenceType: "direct-structured",
        ...(descriptionIsUrl ? { samDescriptionUrl: originalDescription } : {}),
        ...(!o.postedDate || Number.isNaN(new Date(o.postedDate).getTime())
          ? { dateUnknown: true }
          : {}),
      },
    };
  }
}

export const samGovProvider = new SamGovProvider();
