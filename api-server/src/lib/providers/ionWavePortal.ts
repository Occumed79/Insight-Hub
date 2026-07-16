/**
 * IonWave — Direct Tenant Adapter
 *
 * IonWave is a public-sector eProcurement platform operated by DemandStar /
 * IonWave Technologies.  Buyer tenants expose public opportunity listings at:
 *   https://go.ionwave.net/{tenantId}/bids (HTML listing)
 *   https://go.ionwave.net/{tenantId}/bids/{bidId} (detail)
 *
 * Catalog status:
 *   The portal catalog contains one entry that references IonWave
 *   (tn-blount-county), but its URL points to the county government site
 *   (blounttn.gov), not to a direct go.ionwave.net tenant URL.  No catalog
 *   entries with a direct go.ionwave.net URL exist at this time.
 *
 *   IONWAVE_TENANTS is therefore empty.  When a catalog entry is added that
 *   points directly to a go.ionwave.net URL, add the tenant here and register
 *   the PublicPortalSource in publicPortalProviders.ts.
 *
 * Identity:
 *   externalId = "ionwave-{tenantId}-{bidId}"
 *
 * Skipped tenants:
 *   tn-blount-county — catalog URL is blounttn.gov, not ionwave.net; IonWave
 *   is referenced in notes only.  Direct collection not possible without a
 *   confirmed ionwave.net tenant ID.
 *
 * Reliability controls:
 *   - Per-request AbortController timeout
 *   - Two retries with exponential back-off for 429/5xx
 *   - Bounded pagination (IONWAVE_MAX_PAGES, default 5)
 *   - Same-run deduplication by externalId
 *   - Partial results preserved when a page fails
 *   - Login-required tenants skipped immediately
 */

import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { positiveIntegerEnv } from "./officialPortalHttp";

// ─── Constants ────────────────────────────────────────────────────────────────

const IONWAVE_ORIGIN = "https://go.ionwave.net";
const USER_AGENT = "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)";
const UNKNOWN_POSTED_DATE = new Date(0);

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_MAX_RESULTS = 50;

const CLOSED_STATUSES = new Set([
  "closed", "awarded", "cancelled", "expired", "complete", "completed",
]);

// ─── Tenant catalogue ─────────────────────────────────────────────────────────

export interface IonWaveTenant {
  portalId: string;
  /** IonWave tenant ID as it appears in go.ionwave.net/{tenantId}/bids */
  tenantId: string;
  buyerName: string;
  jurisdiction: string;
  publicListing: boolean;
  skipReason?: string;
}

/**
 * Tenant list derived from portal catalog entries that directly use a
 * go.ionwave.net URL.  Currently empty — the only IonWave-referencing catalog
 * entry (tn-blount-county) points to the county's own site, not ionwave.net.
 */
export const IONWAVE_TENANTS: IonWaveTenant[] = [];

export const IONWAVE_TENANT_BY_PORTAL_ID = new Map<string, IonWaveTenant>(
  IONWAVE_TENANTS.map((t) => [t.portalId, t]),
);

export const IONWAVE_PORTAL_IDS = new Set<string>(
  IONWAVE_TENANTS.map((t) => t.portalId),
);

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDate(value?: string | null): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isClosedStatus(status?: string | null): boolean {
  return CLOSED_STATUSES.has((status ?? "").toLowerCase().trim());
}

async function fetchPage(
  url: string,
  timeoutMs: number,
  maxRetries: number,
  signal: AbortSignal,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) throw new Error(`Cancelled: ${url}`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onCancel = () => ctrl.abort();
    signal.addEventListener("abort", onCancel, { once: true });
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,*/*;q=0.9",
          "user-agent": USER_AGENT,
        },
      });
      clearTimeout(timer);
      signal.removeEventListener("abort", onCancel);
      if (res.ok) return res.text();
      const retryable = res.status === 429 || res.status >= 500;
      const body = await res.text().catch(() => "");
      const msg = `IonWave [${url}] HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`;
      if (!retryable || attempt >= maxRetries) throw new Error(msg);
      const ra = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
      await sleep(Number.isFinite(ra) ? Math.min(ra * 1000, 12_000) : 500 * 2 ** attempt);
      lastError = new Error(msg);
    } catch (err) {
      clearTimeout(timer);
      signal.removeEventListener("abort", onCancel);
      if (signal.aborted) throw new Error(`Cancelled: ${url}`);
      const isTimeout = err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
      lastError = isTimeout ? new Error(`IonWave [${url}] timed out after ${timeoutMs}ms`) : err;
      if (attempt >= maxRetries) break;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`IonWave request failed: ${url}`);
}

// ─── Listing parser ───────────────────────────────────────────────────────────

interface IonWaveBidRow {
  bidId: string;
  title?: string;
  status?: string;
  closingDate?: string;
  postedDate?: string;
  department?: string;
  referenceNumber?: string;
  detailUrl: string;
}

function parseBidRows(html: string, tenantId: string): IonWaveBidRow[] {
  const rows: IonWaveBidRow[] = [];
  const seenIds = new Set<string>();

  // IonWave listing links look like /bids/{bidId} or /{tenantId}/bids/{bidId}
  const bidLinks = Array.from(
    html.matchAll(/<a[^>]+href=["'](?:\/[^"'/]*)?\/bids\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  );

  for (const match of bidLinks) {
    const bidId = match[1];
    if (!bidId || seenIds.has(bidId)) continue;
    seenIds.add(bidId);

    const anchorText = stripTags(match[2] ?? "").trim();
    const pos = match.index ?? 0;
    const context = stripTags(html.slice(Math.max(0, pos - 400), pos + match[0].length + 800));

    // Extract closing date
    const closeMatch = context.match(/(?:clos(?:ing|e)|due|deadline)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
    // Extract posted date
    const postedMatch = context.match(/(?:posted?|published?|open)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
    // Extract status
    const statusMatch = context.match(/\b(open|closed|awarded|cancelled|expired)\b/i);
    // Ref number
    const refMatch = context.match(/(?:bid|rfp|rfq|#|no\.?)[:\s#]*([A-Z0-9][A-Z0-9\-./]{2,30})/i);
    // Department
    const deptMatch = context.match(/(?:department|dept)[:\s]+([A-Z][^.\n]{4,60})/i);

    rows.push({
      bidId,
      title: anchorText.length > 8 ? anchorText : undefined,
      status: statusMatch?.[1] ?? "open",
      closingDate: closeMatch?.[1],
      postedDate: postedMatch?.[1],
      department: deptMatch?.[1]?.trim(),
      referenceNumber: refMatch?.[1],
      detailUrl: `${IONWAVE_ORIGIN}/${tenantId}/bids/${bidId}`,
    });
  }

  return rows;
}

function bidRowToOpportunity(row: IonWaveBidRow, tenant: IonWaveTenant, page: number): NormalizedOpportunity | null {
  if (isClosedStatus(row.status)) return null;
  const deadline = parseDate(row.closingDate);
  if (deadline && deadline < new Date()) return null;
  if (!row.title) return null;

  const posted = parseDate(row.postedDate);

  return {
    externalId: `ionwave-${tenant.tenantId}-${row.bidId}`,
    title: row.title,
    agency: tenant.buyerName,
    subAgency: row.department,
    type: "Solicitation",
    status: "active",
    placeOfPerformance: tenant.jurisdiction,
    postedDate: posted ?? UNKNOWN_POSTED_DATE,
    responseDeadline: deadline,
    solicitationNumber: row.referenceNumber,
    sourceUrl: row.detailUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_portal",
      providerPlatform: "ionwave",
      providerType: "ionwave_direct_adapter",
      discoveryMethod: "dedicated_official_adapter",
      sourceBadge: "IonWave Procurement Portal",
      sourceConfidence: "high",
      sourceId: tenant.portalId,
      buyerName: tenant.buyerName,
      tenantId: tenant.tenantId,
      ionWaveBidId: row.bidId,
      listingPage: page,
      canonicalUrl: row.detailUrl,
      collectedAt: new Date().toISOString(),
      documentUrls: [],
      dateUnknown: !posted,
      deadlineUnknown: !deadline,
      tags: [
        "direct-official-portal", "ionwave-platform",
        `jurisdiction:${tenant.jurisdiction}`,
        `portal:${tenant.portalId}`,
        ...(!posted ? ["date-unknown"] : []),
      ],
    },
  };
}

// ─── Per-tenant collection ────────────────────────────────────────────────────

async function collectIonWaveTenant(
  tenant: IonWaveTenant,
  maxPages: number,
  maxResults: number,
  timeoutMs: number,
  maxRetries: number,
  signal: AbortSignal,
): Promise<{ records: NormalizedOpportunity[]; error?: string; skipped?: boolean; skipReason?: string }> {
  if (!tenant.publicListing) {
    return { records: [], skipped: true, skipReason: tenant.skipReason ?? "login-required" };
  }

  const records: NormalizedOpportunity[] = [];
  const seenIds = new Set<string>();

  for (let page = 1; page <= maxPages && records.length < maxResults; page++) {
    if (signal.aborted) return { records, error: "cancelled" };

    const url = `${IONWAVE_ORIGIN}/${tenant.tenantId}/bids${page > 1 ? `?page=${page}` : ""}`;
    let html: string;
    try {
      html = await fetchPage(url, timeoutMs, maxRetries, signal);
    } catch (err) {
      return { records, error: err instanceof Error ? err.message : String(err) };
    }

    if (/log\s*in\s*to\s*continue|sign\s*in\s*to\s*view|please\s*log\s*in/i.test(html)) {
      return { records, skipped: true, skipReason: "login-required: listing redirected to login" };
    }

    const rows = parseBidRows(html, tenant.tenantId);
    if (rows.length === 0) break;

    for (const row of rows) {
      const opp = bidRowToOpportunity(row, tenant, page);
      if (!opp || seenIds.has(opp.externalId)) continue;
      seenIds.add(opp.externalId);
      records.push(opp);
      if (records.length >= maxResults) break;
    }

    if (rows.length < 10) break;
  }

  return { records };
}

async function runWithConcurrency<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const slots = Math.min(Math.max(concurrency, 1), items.length || 1);
  await Promise.all(Array.from({ length: slots }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      const item = items[idx];
      if (item !== undefined) await worker(item);
    }
  }));
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class IonWavePortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  constructor(private readonly tenants: readonly IonWaveTenant[] = IONWAVE_TENANTS) {}

  async isConfigured(): Promise<boolean> { return true; }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const maxPages = positiveIntegerEnv("IONWAVE_MAX_PAGES", DEFAULT_MAX_PAGES, 1, 20);
    const maxResults = positiveIntegerEnv("IONWAVE_MAX_RESULTS", DEFAULT_MAX_RESULTS, 1, 500);
    const concurrency = positiveIntegerEnv("IONWAVE_CONCURRENCY", 3, 1, 10);
    const timeoutMs = positiveIntegerEnv("IONWAVE_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("IONWAVE_MAX_RETRIES", DEFAULT_MAX_RETRIES, 0, 5);
    const limit = Math.max(options.limit ?? (this.tenants.length * maxResults), 1);
    const outerCtrl = new AbortController();
    const allRecords: NormalizedOpportunity[] = [];
    const allErrors: string[] = [];
    const globalSeen = new Set<string>();

    await runWithConcurrency(
      this.tenants.filter((t) => t.publicListing),
      concurrency,
      async (tenant) => {
        const res = await collectIonWaveTenant(tenant, maxPages, maxResults, timeoutMs, maxRetries, outerCtrl.signal);
        if (res.skipped) { allErrors.push(`${tenant.portalId}: skipped — ${res.skipReason}`); return; }
        if (res.error) allErrors.push(`${tenant.portalId}: ${res.error}`);
        for (const rec of res.records) {
          if (globalSeen.has(rec.externalId)) continue;
          globalSeen.add(rec.externalId);
          allRecords.push(rec);
          if (allRecords.length >= limit) return;
        }
      },
    );

    const records = allRecords.slice(0, limit);
    return { records, total: records.length, errors: allErrors };
  }

  async getStatus(): Promise<ProviderStatus> {
    return { name: "publicPortalProviders", configured: true, healthy: true };
  }
}

export const ionWavePortalProvider = new IonWavePortalProvider();

export function ionWaveTenantProvider(portalId: string): DataSourceProvider | undefined {
  const tenant = IONWAVE_TENANT_BY_PORTAL_ID.get(portalId);
  if (!tenant) return undefined;
  return new IonWavePortalProvider([tenant]);
}
