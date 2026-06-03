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
  classificationCode?: string;
  postedDate?: string;
  responseDeadLine?: string;
  archiveDate?: string;
  typeOfSetAside?: string;
  typeOfSetAsideDescription?: string;
  placeOfPerformance?: { city?: { name?: string }; state?: { code?: string } };
  officeAddress?: { city?: string; state?: string };
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

    // Occu-Med relevant NAICS codes:
    // 621111 - Offices of Physicians (except Mental Health)
    // 621999 - All Other Miscellaneous Ambulatory Health Care Services
    // 621512 - Diagnostic Imaging Centers
    // 621310 - Offices of Chiropractors (DOT/physical exams)
    // 561320 - Temporary Help Services (staffed health programs)
    // 923120 - Administration of Public Health Programs
    const OCCUMED_NAICS = ["621111", "621999", "621512", "621310", "561320", "923120"];

    // Occu-Med default keywords to search when no custom keywords provided
    const DEFAULT_KEYWORDS = "occupational health";

    const params = new URLSearchParams({
      api_key: apiKey,
      postedFrom: fmt(fromDate),
      postedTo: fmt(today),
      limit: String(options.limit ?? 100),
      offset: String(options.offset ?? 0),
    });

    // Always search with Occu-Med relevant keywords for better signal
    const searchKeywords = options.keywords?.trim() || DEFAULT_KEYWORDS;
    params.set("keywords", searchKeywords);

    // Note: we do NOT filter by typeOfNotice here because SAM.gov returns "o,p,k,r" format
    // differently across API versions. Post-fetch relevance filtering handles quality instead.

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

    // Broad Occu-Med relevance terms — intentionally loose here.
    // The write-time quality filter in unifiedSearch handles strict rejection.
    // Being too strict here causes SAM.gov to return 0 records even when good ones exist.
    const OCCUMED_RELEVANT_TERMS = [
      // Core service lines
      "occupational health", "occupational medicine", "occupational medical",
      "occ health", "occmed",
      // Drug & alcohol
      "drug test", "drug screen", "alcohol test", "substance abuse",
      "dot drug", "mro ", "medical review officer", "breath alcohol",
      "random test", "post-accident", "return to duty", "return-to-duty",
      // Physicals & exams
      "physical exam", "medical exam", "dot physical", "dot examination",
      "pre-employment", "pre employment", "pre-placement",
      "fitness for duty", "fit for duty", "work capacity",
      // Surveillance & monitoring
      "medical surveillance", "health surveillance", "employee health",
      "workplace health", "worker health", "health screening",
      "biometric", "biological monitoring",
      // Specific tests
      "audiometric", "audiogram", "hearing conservation", "pulmonary function",
      "spirometry", "respirator fit", "fit test",
      "vaccination", "immunization", "tb test", "tuberculosis",
      // NAICS codes — exact match on any of these is a strong signal
      "621111", "621999", "621512", "621310",
    ];

    const normalized = opps.map((o) => this.normalize(o));

    // Loose pre-filter: pass anything that has at least one signal in title or NAICS.
    // The write-time filter in unifiedSearch applies the strict rejection logic.
    const relevant = normalized.filter((opp) => {
      const text = `${opp.title} ${opp.naicsCode ?? ""}`.toLowerCase();
      const desc = (opp.description ?? "").toLowerCase();
      return OCCUMED_RELEVANT_TERMS.some((term) => text.includes(term) || desc.includes(term));
    });

    const noMatchWarning = relevant.length === 0 && normalized.length > 0
      ? ["SAM.gov returned " + normalized.length + " records but none matched. The API may be returning unrelated results for this keyword — try 'occupational health' or 'drug testing'."]
      : [];

    return {
      records: relevant,
      total: json.totalRecords ?? opps.length,
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
      postedDate: o.postedDate ? new Date(o.postedDate) : new Date(),
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
          return parts.length > 0 ? parts.join(" · ") : null;
        }
        return d;
      })(),
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
