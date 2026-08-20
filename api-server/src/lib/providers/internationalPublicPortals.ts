import { createHash } from "crypto";

import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { webIntelligenceFetch } from "../search/webIntelligence";
import { classifyResult } from "../search/relevance";

const TED_SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search";
const TED_NOTICE_BASE = "https://ted.europa.eu/en/notice/-/detail";
const CANADA_BUYS_HOST = "canadabuys.canada.ca";
const DEFAULT_LIMIT = 100;
const TED_PAGE_LIMIT = 100;
const UNKNOWN_POSTED_DATE = new Date(0);

const OCCUMED_SERVICE_TERMS = [
  "occupational health",
  "occupational medicine",
  "employee health",
  "medical surveillance",
  "fitness for duty",
  "fitness-for-duty",
  "pre-employment physical",
  "pre employment medical",
  "drug testing",
  "alcohol testing",
  "audiometric",
  "audiometry",
  "spirometry",
  "respirator fit testing",
  "health surveillance",
  "company health services",
];

function normalizedHost(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

export function isOfficialCanadaBuysTenderUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      normalizedHost(parsed.hostname) === CANADA_BUYS_HOST &&
      /^\/en\/tender-opportunities(?:\/|$)/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function serviceExpression(): string {
  return OCCUMED_SERVICE_TERMS.map((term) => `"${term}"`).join(" OR ");
}

export function buildCanadaBuysQueries(keywords?: string): string[] {
  const focus = keywords?.trim();
  const service = serviceExpression();
  const extra = focus ? ` (${focus})` : "";
  return [
    `site:${CANADA_BUYS_HOST}/en/tender-opportunities (${service}) (tender OR solicitation OR RFP OR RFQ OR procurement)${extra} -award -awarded`,
    `site:${CANADA_BUYS_HOST}/en/tender-opportunities ("medical surveillance" OR "fitness for duty" OR "drug testing" OR audiometry OR spirometry OR "respirator fit testing")${extra} -award -awarded`,
  ];
}

function tedQueryForKeywords(keywords?: string): string {
  const focus = keywords?.trim();
  if (focus) {
    const escaped = focus.replace(/"/g, "").slice(0, 120);
    return `(classification-cpv=85147000 OR FT~"${escaped}")`;
  }
  return "classification-cpv=85147000";
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const preferred of ["eng", "ENG", "en", "value", "label", "text"]) {
      const found = firstString(object[preferred]);
      if (found) return found;
    }
    for (const entry of Object.values(object)) {
      const found = firstString(entry);
      if (found) return found;
    }
  }
  return undefined;
}

function tedField(record: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = firstString(record[name]);
    if (value) return value;
  }
  return undefined;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.slice(0, 10));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseMoney(value?: string): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^0-9.,-]/g, "");
  if (!cleaned) return undefined;
  const normalized = cleaned.includes(",") && cleaned.includes(".")
    ? cleaned.replace(/,/g, "")
    : cleaned.replace(/,/g, ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function tedNoticeUrl(publicationNumber?: string): string {
  return publicationNumber
    ? `${TED_NOTICE_BASE}/${encodeURIComponent(publicationNumber)}`
    : "https://ted.europa.eu/en/";
}

function tedRecordToOpportunity(record: Record<string, unknown>): NormalizedOpportunity | null {
  const publicationNumber = tedField(
    record,
    "publication-number",
    "publicationNumber",
    "notice-identifier",
    "noticeIdentifier",
  );
  const title = tedField(record, "notice-title", "noticeTitle", "title") ?? "European public procurement opportunity";
  const buyer = tedField(record, "buyer-name", "buyerName", "organisation-name-buyer") ?? "European public buyer";
  const description = [
    tedField(record, "description-proc", "descriptionProc"),
    tedField(record, "description-lot", "descriptionLot"),
  ]
    .filter(Boolean)
    .join("\n\n") || undefined;
  const rawText = `${title} ${description ?? ""}`;
  const classification = classifyResult({
    title,
    snippet: description ?? "",
    url: tedNoticeUrl(publicationNumber),
    allowHistorical: false,
  });
  const cpv = tedField(record, "classification-cpv", "classificationCpv");
  const serviceMatch = /occupational|company health|employee health|medical surveillance|health surveillance|fitness.{0,3}(?:for|to).{0,3}duty|pre[- ]employment|drug testing|alcohol testing|audiometr|spirometr|respirator fit/i.test(rawText);
  if (classification.rejected && cpv !== "85147000") return null;
  if (!serviceMatch && cpv !== "85147000") return null;

  const postedDate = parseDate(tedField(record, "publication-date", "publicationDate", "dispatch-date"));
  const deadline = parseDate(
    tedField(
      record,
      "deadline",
      "deadline-receipt-tender-date-lot",
      "deadlineReceiptTenderDateLot",
    ),
  );
  if (deadline && deadline.getTime() < Date.now()) return null;

  const idSeed = publicationNumber ?? `${title}|${buyer}|${deadline?.toISOString() ?? ""}`;
  const externalId = `ted-${createHash("sha256").update(idSeed).digest("hex").slice(0, 20)}`;
  const location = tedField(
    record,
    "buyer-country",
    "place-of-performance",
    "placeOfPerformance",
    "organisation-country-buyer",
    "country-procurement",
  );
  const estimatedValue = parseMoney(
    tedField(record, "estimated-value-proc", "estimatedValueProc", "total-value", "estimated-value-lot"),
  );

  return {
    externalId,
    title,
    agency: buyer,
    type: tedField(record, "notice-type", "noticeType", "form-type") ?? "Solicitation",
    status: "active",
    postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline: deadline,
    description,
    location,
    placeOfPerformance: location,
    estimatedValue,
    sourceUrl: tedNoticeUrl(publicationNumber),
    solicitationNumber: publicationNumber,
    source: "internationalPublicPortals",
    providerName: "internationalPublicPortals",
    rawData: {
      providerName: "internationalPublicPortals",
      providerFamily: "international_public_procurement",
      internationalSource: "ted",
      portalName: "Tenders Electronic Daily (TED)",
      geography: "Europe",
      country: tedField(record, "buyer-country", "organisation-country-buyer", "country-procurement"),
      currency: tedField(record, "estimated-value-cur-proc", "total-value-cur"),
      cpv,
      directOfficialApi: true,
      authenticationRequired: false,
      sourceConfidence: "high",
      evidenceType: "direct-structured",
      buyerProvenance: "official_structured",
      deadlineProvenance: deadline ? "official_structured" : "unknown",
      statusProvenance: "official_structured",
      descriptionProvenance: description ? "official_structured" : "unknown",
      ted: record,
    },
  };
}

async function fetchTed(options: FetchOptions): Promise<ProviderFetchResult> {
  const query = tedQueryForKeywords(options.keywords);
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), TED_PAGE_LIMIT);
  const response = await fetch(TED_SEARCH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      query,
      fields: [
        "publication-number",
        "notice-title",
        "buyer-name",
        "buyer-country",
        "notice-type",
        "publication-date",
        "deadline",
        "description-proc",
        "description-lot",
        "classification-cpv",
        "estimated-value-proc",
        "estimated-value-cur-proc",
        "total-value",
        "total-value-cur",
      ],
      page: 1,
      limit,
      scope: "ACTIVE",
      checkQuerySyntax: false,
      paginationMode: "PAGE_NUMBER",
    }),
    signal: options.signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`TED Search API ${response.status}: ${body.replace(/\s+/g, " ").slice(0, 240)}`);
  }
  const json = (await response.json()) as Record<string, unknown>;
  const rawNotices = (
    (Array.isArray(json.notices) && json.notices) ||
    (Array.isArray(json.results) && json.results) ||
    (Array.isArray(json.content) && json.content) ||
    []
  ) as unknown[];
  const records = rawNotices
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map(tedRecordToOpportunity)
    .filter((entry): entry is NormalizedOpportunity => entry != null);
  return {
    records,
    total: records.length,
    errors: [],
    diagnostics: {
      internationalSource: "ted",
      mode: "official-search-api",
      queryCount: 1,
      queries: [query],
      apiAnonymous: true,
      candidates: rawNotices.length,
      accepted: records.length,
    },
  };
}

async function fetchCanadaBuys(options: FetchOptions): Promise<ProviderFetchResult> {
  const queries = buildCanadaBuysQueries(options.keywords);
  const result = await webIntelligenceFetch({
    keywords: options.keywords,
    discoveryQueries: queries,
    candidateUrlFilter: isOfficialCanadaBuysTenderUrl,
    dateRange: options.dateRange,
    // CanadaBuys runs on every default Fetch Intelligence request, so keep this
    // source on renewable/keyless capacity and do not burn monthly pools twice.
    useKeenable: true,
    useYou: true,
    useBrowserbase: true,
    useExa: false,
    useLangsearch: false,
    useLinkup: false,
    useParallel: false,
    useFirecrawl: false,
    useSocrata: false,
    useWebsearch: false,
    useRssAggregator: false,
    useSelfHostedSearch: false,
    useSelfHostedCrawler: false,
    discoveryPoolId: "canada-buys-official",
    signal: options.signal,
  });
  const records = result.opportunities
    .filter((record) => isOfficialCanadaBuysTenderUrl(record.sourceUrl))
    .map((record) => ({
      ...record,
      source: "internationalPublicPortals" as const,
      providerName: "internationalPublicPortals",
      location: record.location ?? record.placeOfPerformance ?? "Canada",
      rawData: {
        ...(record.rawData ?? {}),
        providerName: "internationalPublicPortals",
        providerFamily: "international_public_procurement",
        internationalSource: "canadaBuys",
        portalName: "CanadaBuys",
        geography: "Canada",
        directOfficialPortal: true,
        evidenceType: "authoritative-page",
        sourceConfidence: "high",
      },
    }));
  return {
    records,
    total: records.length,
    errors: result.errors,
    diagnostics: {
      internationalSource: "canadaBuys",
      mode: "official-domain-renewable-discovery",
      queryCount: queries.length,
      queries,
      candidates: result.stats.totalCandidates,
      accepted: records.length,
      aiScorers: result.stats.aiScorers,
    },
  };
}

export class InternationalPublicPortalsProvider implements DataSourceProvider {
  readonly name = "internationalPublicPortals" as const;

  async isConfigured(): Promise<boolean> {
    // TED published-notice search is anonymous and requires no API key.
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const settled = await Promise.allSettled([
      fetchCanadaBuys(options),
      fetchTed(options),
    ]);
    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];
    const sources: Record<string, unknown> = {};

    const labels = ["canadaBuys", "ted"] as const;
    settled.forEach((entry, index) => {
      const label = labels[index]!;
      if (entry.status === "rejected") {
        errors.push(`${label}: ${entry.reason instanceof Error ? entry.reason.message : String(entry.reason)}`);
        sources[label] = { status: "failed" };
        return;
      }
      records.push(...entry.value.records);
      errors.push(...entry.value.errors.map((error) => `${label}: ${error}`));
      sources[label] = {
        status: entry.value.errors.length > 0 ? "warning" : "ok",
        records: entry.value.records.length,
        diagnostics: entry.value.diagnostics,
      };
    });

    const seen = new Set<string>();
    const deduped = records.filter((record) => {
      const key = (record.sourceUrl ?? record.externalId).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT);
    const limited = deduped.slice(0, limit);

    return {
      records: limited,
      total: limited.length,
      errors: Array.from(new Set(errors)).slice(0, 20),
      diagnostics: {
        mode: "canada-europe-first-class",
        sources,
        candidatesBeforeDedupe: records.length,
        acceptedAfterDedupe: limited.length,
      },
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: true,
      healthy: true,
      recordCount: 2,
      errorMessage: undefined,
    };
  }
}

export const internationalPublicPortalsProvider = new InternationalPublicPortalsProvider();
