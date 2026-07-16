import { createHash } from "node:crypto";
import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { fetchOfficialPortalText, positiveIntegerEnv } from "./officialPortalHttp";

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_RESULTS_PER_TENANT = 50;
const UNKNOWN_POSTED_DATE = new Date(0);

export interface IonWaveTenant {
  portalId: string;
  tenantId: string;
  buyerName: string;
  state: string;
  listingUrl: string;
  origin: string;
}

export const IONWAVE_TENANTS: IonWaveTenant[] = [
  {
    portalId: "tn-blount-county",
    tenantId: "blounttn",
    buyerName: "Blount County",
    state: "TN",
    listingUrl: "https://blounttn.ionwave.net/SourcingEvents.aspx?SourceType=1",
    origin: "https://blounttn.ionwave.net",
  },
];

export const IONWAVE_COLLECTIBLE_PORTAL_IDS = new Set(
  IONWAVE_TENANTS.map((tenant) => tenant.portalId),
);

const TENANT_BY_PORTAL_ID = new Map(
  IONWAVE_TENANTS.map((tenant) => [tenant.portalId, tenant]),
);

interface IonWaveRow {
  bidId: string;
  bidNumber: string;
  title: string;
  type: string;
  organization: string;
  openDate?: string;
  closeDate?: string;
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseClientKeyValues(html: string): Map<number, string> {
  // Extracts {"0":{"BidID":"962"},"1":{"BidID":"963"},...} from Telerik grid state
  const bidIds = new Map<number, string>();
  const match = html.match(/"_clientKeyValues":\{(.*?)\},"_controlToFocus"/);
  if (!match) return bidIds;
  try {
    const parsed = JSON.parse(`{${match[1]}}`) as Record<string, { BidID?: string }>;
    for (const [indexStr, obj] of Object.entries(parsed)) {
      const index = Number.parseInt(indexStr, 10);
      if (Number.isFinite(index) && obj.BidID) bidIds.set(index, obj.BidID);
    }
  } catch {
    // Ignore parse errors; return empty map
  }
  return bidIds;
}

export function parseIonWaveListingHtml(html: string): IonWaveRow[] {
  const bidIds = parseClientKeyValues(html);
  const rows: IonWaveRow[] = [];

  // Match rows with class rgRow or rgAltRow
  const rowPattern = /class="rg(?:Row|AltRow)"[^>]*>(.*?)<\/tr/gs;
  let rowIndex = 0;

  for (const rowMatch of html.matchAll(rowPattern)) {
    const rowHtml = rowMatch[1] ?? "";
    const cellPattern = /<td[^>]*>(.*?)<\/td>/gs;
    const cells: string[] = [];
    for (const cellMatch of rowHtml.matchAll(cellPattern)) {
      cells.push(stripTags(cellMatch[1] ?? ""));
    }
    // Columns: [0]=action (login icon), [1]=BidNumber, [2]=Title, [3]=Type, [4]=Org (hidden), [5]=OpenDate, [6]=CloseDate
    const bidNumber = cells[1]?.trim();
    const title = cells[2]?.trim();
    const type = cells[3]?.trim() ?? "";
    const organization = cells[4]?.trim() ?? "";
    const openDate = cells[5]?.trim() || undefined;
    const closeDate = cells[6]?.trim() || undefined;

    if (!bidNumber || !title) {
      rowIndex += 1;
      continue;
    }

    const bidId = bidIds.get(rowIndex) ?? createHash("sha256").update(`${bidNumber}|${title}`).digest("hex").slice(0, 16);

    rows.push({ bidId, bidNumber, title, type, organization, openDate, closeDate });
    rowIndex += 1;
  }

  return rows;
}

function parseIonWaveDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  // Format: "7/30/2026 01:30:00 PM (ET)" or "7/7/2026"
  const cleaned = value.replace(/\s*\(.*?\)\s*/g, "").trim();
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeIonWaveType(type: string): string {
  const lower = type.toLowerCase();
  if (lower === "rfp") return "RFP";
  if (lower === "rfq") return "RFQ";
  if (lower === "rfi") return "RFI";
  if (lower === "itb" || lower === "bid" || lower === "ifb") return "Bid";
  return type || "Solicitation";
}

function stableIonWaveId(tenant: IonWaveTenant, row: IonWaveRow): string {
  return `ionwave-${tenant.tenantId}-${row.bidId}`;
}

function rowToOpportunity(
  row: IonWaveRow,
  tenant: IonWaveTenant,
  listingUrl: string,
): NormalizedOpportunity {
  const postedDate = parseIonWaveDate(row.openDate);
  const responseDeadline = parseIonWaveDate(row.closeDate);
  const sourceUrl = listingUrl;

  return {
    externalId: stableIonWaveId(tenant, row),
    title: row.title,
    agency: tenant.buyerName,
    type: normalizeIonWaveType(row.type),
    status: "active",
    postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline,
    placeOfPerformance: tenant.state,
    solicitationNumber: row.bidNumber || undefined,
    sourceUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_portal",
      providerPlatform: "ionwave_euna",
      providerType: "ionwave_public_bid_listing",
      connectorName: "IonWave/Euna shared adapter",
      discoveryMethod: "dedicated_official_adapter",
      sourceBadge: "IonWave Official Portal",
      sourceConfidence: "high",
      sourceId: tenant.portalId,
      tenantSlugOrId: tenant.tenantId,
      nativeOpportunityId: row.bidId,
      buyerName: tenant.buyerName,
      buyerState: tenant.state,
      listingUrl,
      canonicalUrl: sourceUrl,
      listingPage: 1,
      documentUrls: [] as string[],
      dateUnknown: !postedDate,
      deadlineUnknown: !responseDeadline,
      collectedAt: new Date().toISOString(),
      tags: [
        "direct-official-portal",
        "ionwave-euna-platform",
        `state:${tenant.state}`,
        `tenant:${tenant.tenantId}`,
        `portal:${tenant.portalId}`,
        ...(!postedDate ? ["date-unknown"] : []),
      ],
    },
  };
}

interface TenantCollectionResult {
  records: NormalizedOpportunity[];
  errors: string[];
}

async function collectTenant(
  tenant: IonWaveTenant,
  options: FetchOptions,
): Promise<TenantCollectionResult> {
  const timeoutMs = positiveIntegerEnv("IONWAVE_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, 3_000, 60_000);
  const maxRetries = positiveIntegerEnv("IONWAVE_MAX_RETRIES", DEFAULT_MAX_RETRIES, 0, 5);
  const maxResults = positiveIntegerEnv("IONWAVE_MAX_RESULTS_PER_TENANT", DEFAULT_MAX_RESULTS_PER_TENANT, 1, 200);
  const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
  const errors: string[] = [];

  let html: string;
  try {
    html = await fetchOfficialPortalText(tenant.listingUrl, {
      label: `${tenant.portalId} IonWave bid listing`,
      origin: tenant.origin,
      timeoutMs,
      maxRetries,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { records: [], errors: [`${tenant.portalId}: ${reason}`] };
  }

  const rows = parseIonWaveListingHtml(html);
  const seenIds = new Set<string>();
  const records: NormalizedOpportunity[] = [];
  const keywords = options.keywords?.toLowerCase().split(/\s+/).filter(Boolean);

  for (const row of rows) {
    if (keywords?.length) {
      const haystack = [row.title, row.bidNumber, row.organization, tenant.buyerName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!keywords.some((kw) => haystack.includes(kw))) continue;
    }

    // Filter by date range if provided
    if (options.dateRange) {
      const posted = parseIonWaveDate(row.openDate);
      if (posted) {
        const cutoff = Date.now() - options.dateRange * 86_400_000;
        if (posted.getTime() < cutoff) continue;
      }
    }

    const record = rowToOpportunity(row, tenant, tenant.listingUrl);
    if (seenIds.has(record.externalId)) continue;
    seenIds.add(record.externalId);
    records.push(record);
    if (records.length >= requestedLimit) break;
  }

  const offset = Math.max(options.offset ?? 0, 0);
  return { records: records.slice(offset, offset + requestedLimit), errors };
}

export class IonWavePortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  constructor(private readonly tenants: readonly IonWaveTenant[] = IONWAVE_TENANTS) {}

  async isConfigured(): Promise<boolean> {
    return this.tenants.length > 0;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    for (const tenant of this.tenants) {
      const result = await collectTenant(tenant, options);
      errors.push(...result.errors);
      for (const record of result.records) {
        if (seen.has(record.externalId)) continue;
        seen.add(record.externalId);
        records.push(record);
      }
    }

    this.recordCount = records.length;
    this.lastError = errors.length ? errors.join("; ") : undefined;
    if (!errors.length || records.length) this.lastSuccess = new Date();
    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return {
      name: this.name,
      configured,
      healthy: configured && !this.lastError,
      errorMessage: this.lastError,
      lastAttempt: this.lastAttempt,
      lastSuccess: this.lastSuccess,
      recordCount: this.recordCount,
    };
  }
}

export function ionWaveTenantProvider(portalId: string): DataSourceProvider | undefined {
  const tenant = TENANT_BY_PORTAL_ID.get(portalId);
  if (!tenant) return undefined;
  return new IonWavePortalProvider([tenant]);
}

export const ionWavePortalProviders: Record<string, DataSourceProvider> = Object.fromEntries(
  IONWAVE_TENANTS.map((tenant) => [tenant.portalId, new IonWavePortalProvider([tenant])]),
);

// Exported for testing
export { stableIonWaveId, rowToOpportunity, parseIonWaveDate, UNKNOWN_POSTED_DATE as IONWAVE_UNKNOWN_POSTED_DATE };
