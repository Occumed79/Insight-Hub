/**
 * BidExpress — Direct Tenant Adapter
 *
 * BidExpress (bidexpress.com) is an eProcurement platform for public agencies.
 * Public opportunity listings are accessible at:
 *   https://www.bidexpress.com/businesses/{businessId}/bids
 *
 * Catalog status:
 *   The portal catalog contains zero entries with a bidexpress.com URL.
 *   BIDEXPRESS_TENANTS is empty.  When catalog entries with direct
 *   bidexpress.com URLs are added, register them here and in
 *   publicPortalProviders.ts.
 *
 * Identity:
 *   externalId = "bidexpress-{businessId}-{bidId}"
 *
 * Reliability controls:
 *   - Per-request AbortController timeout
 *   - Two retries with exponential back-off for 429/5xx
 *   - Bounded pagination (BIDEXPRESS_MAX_PAGES, default 5)
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

const BIDEXPRESS_ORIGIN = "https://www.bidexpress.com";
const USER_AGENT = "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)";
const UNKNOWN_POSTED_DATE = new Date(0);

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_MAX_RESULTS = 50;

const CLOSED_STATUSES = new Set([
  "closed", "awarded", "cancelled", "expired", "complete", "completed",
  "bid awarded",
]);

// ─── Tenant catalogue ─────────────────────────────────────────────────────────

export interface BidExpressTenant {
  portalId: string;
  /** BidExpress business ID as it appears in /businesses/{businessId}/bids */
  businessId: string;
  buyerName: string;
  jurisdiction: string;
  publicListing: boolean;
  skipReason?: string;
}

/**
 * Tenant list derived from portal catalog entries that directly use a
 * bidexpress.com URL.  Currently empty — the catalog contains no entries with
 * a direct bidexpress.com URL.
 */
export const BIDEXPRESS_TENANTS: BidExpressTenant[] = [];

export const BIDEXPRESS_TENANT_BY_PORTAL_ID = new Map<string, BidExpressTenant>(
  BIDEXPRESS_TENANTS.map((t) => [t.portalId, t]),
);

export const BIDEXPRESS_PORTAL_IDS = new Set<string>(
  BIDEXPRESS_TENANTS.map((t) => t.portalId),
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
      const msg = `BidExpress [${url}] HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`;
      if (!retryable || attempt >= maxRetries) throw new Error(msg);
      const ra = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
      await sleep(Number.isFinite(ra) ? Math.min(ra * 1000, 12_000) : 500 * 2 ** attempt);
      lastError = new Error(msg);
    } catch (err) {
      clearTimeout(timer);
      signal.removeEventListener("abort", onCancel);
      if (signal.aborted) throw new Error(`Cancelled: ${url}`);
      const isTimeout = err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
      lastError = isTimeout ? new Error(`BidExpress [${url}] timed out after ${timeoutMs}ms`) : err;
      if (attempt >= maxRetries) break;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`BidExpress request failed: ${url}`);
}

// ─── Listing parser ───────────────────────────────────────────────────────────

interface BidExpressRow {
  bidId: string;
  title?: string;
  status?: string;
  letDate?: string;
  postedDate?: string;
  department?: string;
  bidNumber?: string;
  detailUrl: string;
}

function parseBidRows(html: string, businessId: string): BidExpressRow[] {
  const rows: BidExpressRow[] = [];
  const seenIds = new Set<string>();

  // BidExpress detail links: /businesses/{id}/bids/{bidId}
  const pattern = /<a[^>]+href=["'](?:\/businesses\/[^/]+)?\/bids\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(pattern)) {
    const bidId = match[1];
    if (!bidId || seenIds.has(bidId)) continue;
    seenIds.add(bidId);

    const anchorText = stripTags(match[2] ?? "").trim();
    const pos = match.index ?? 0;
    const context = stripTags(html.slice(Math.max(0, pos - 400), pos + match[0].length + 800));

    const letMatch = context.match(/(?:let\s+date|bid\s+open(?:ing)?|due)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
    const postedMatch = context.match(/(?:posted?|advertised?|date\s+posted)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
    const statusMatch = context.match(/\b(open|closed|awarded|cancelled|expired|bid awarded)\b/i);
    const bidNumMatch = context.match(/(?:bid\s*#?|project\s*#?|contract\s*#?)[:\s]*([A-Z0-9][A-Z0-9\-./]{2,30})/i);
    const deptMatch = context.match(/(?:agency|department|dept)[:\s]+([A-Z][^.\n]{4,60})/i);

    rows.push({
      bidId,
      title: anchorText.length > 8 ? anchorText : undefined,
      status: statusMatch?.[1] ?? "open",
      letDate: letMatch?.[1],
      postedDate: postedMatch?.[1],
      department: deptMatch?.[1]?.trim(),
      bidNumber: bidNumMatch?.[1],
      detailUrl: `${BIDEXPRESS_ORIGIN}/businesses/${businessId}/bids/${bidId}`,
    });
  }

  return rows;
}

function rowToOpportunity(row: BidExpressRow, tenant: BidExpressTenant, page: number): NormalizedOpportunity | null {
  if (isClosedStatus(row.status)) return null;
  const deadline = parseDate(row.letDate);
  if (deadline && deadline < new Date()) return null;
  if (!row.title) return null;

  const posted = parseDate(row.postedDate);

  return {
    externalId: `bidexpress-${tenant.businessId}-${row.bidId}`,
    title: row.title,
    agency: tenant.buyerName,
    subAgency: row.department,
    type: "Solicitation",
    status: "active",
    placeOfPerformance: tenant.jurisdiction,
    postedDate: posted ?? UNKNOWN_POSTED_DATE,
    responseDeadline: deadline,
    solicitationNumber: row.bidNumber,
    sourceUrl: row.detailUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_portal",
      providerPlatform: "bidexpress",
      providerType: "bidexpress_direct_adapter",
      discoveryMethod: "dedicated_official_adapter",
      sourceBadge: "BidExpress Procurement Portal",
      sourceConfidence: "high",
      sourceId: tenant.portalId,
      buyerName: tenant.buyerName,
      businessId: tenant.businessId,
      bidExpressBidId: row.bidId,
      listingPage: page,
      canonicalUrl: row.detailUrl,
      collectedAt: new Date().toISOString(),
      documentUrls: [],
      dateUnknown: !posted,
      deadlineUnknown: !deadline,
      tags: [
        "direct-official-portal", "bidexpress-platform",
        `jurisdiction:${tenant.jurisdiction}`,
        `portal:${tenant.portalId}`,
        ...(!posted ? ["date-unknown"] : []),
      ],
    },
  };
}

// ─── Per-tenant collection ────────────────────────────────────────────────────

async function collectBidExpressTenant(
  tenant: BidExpressTenant,
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

    const url = `${BIDEXPRESS_ORIGIN}/businesses/${tenant.businessId}/bids${page > 1 ? `?page=${page}` : ""}`;
    let html: string;
    try {
      html = await fetchPage(url, timeoutMs, maxRetries, signal);
    } catch (err) {
      return { records, error: err instanceof Error ? err.message : String(err) };
    }

    if (/log\s*in\s*to\s*continue|sign\s*in\s*to\s*view|please\s*log\s*in/i.test(html)) {
      return { records, skipped: true, skipReason: "login-required: listing redirected to login" };
    }

    const rows = parseBidRows(html, tenant.businessId);
    if (rows.length === 0) break;

    for (const row of rows) {
      const opp = rowToOpportunity(row, tenant, page);
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

export class BidExpressPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  constructor(private readonly tenants: readonly BidExpressTenant[] = BIDEXPRESS_TENANTS) {}

  async isConfigured(): Promise<boolean> { return true; }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const maxPages = positiveIntegerEnv("BIDEXPRESS_MAX_PAGES", DEFAULT_MAX_PAGES, 1, 20);
    const maxResults = positiveIntegerEnv("BIDEXPRESS_MAX_RESULTS", DEFAULT_MAX_RESULTS, 1, 500);
    const concurrency = positiveIntegerEnv("BIDEXPRESS_CONCURRENCY", 3, 1, 10);
    const timeoutMs = positiveIntegerEnv("BIDEXPRESS_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("BIDEXPRESS_MAX_RETRIES", DEFAULT_MAX_RETRIES, 0, 5);
    const limit = Math.max(options.limit ?? (this.tenants.length * maxResults), 1);
    const outerCtrl = new AbortController();
    const allRecords: NormalizedOpportunity[] = [];
    const allErrors: string[] = [];
    const globalSeen = new Set<string>();

    await runWithConcurrency(
      this.tenants.filter((t) => t.publicListing),
      concurrency,
      async (tenant) => {
        const res = await collectBidExpressTenant(tenant, maxPages, maxResults, timeoutMs, maxRetries, outerCtrl.signal);
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

export const bidExpressPortalProvider = new BidExpressPortalProvider();

export function bidExpressTenantProvider(portalId: string): DataSourceProvider | undefined {
  const tenant = BIDEXPRESS_TENANT_BY_PORTAL_ID.get(portalId);
  if (!tenant) return undefined;
  return new BidExpressPortalProvider([tenant]);
}
