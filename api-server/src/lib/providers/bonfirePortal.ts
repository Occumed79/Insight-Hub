/**
 * Bonfire / Euna Supplier Network — Direct Tenant Adapter
 *
 * Replaces the Serper-based discovery path with a real per-tenant HTTP
 * adapter against the publicly accessible Bonfire opportunity listings.
 *
 * Public interface:
 *   Listing : GET https://{tenant}.bonfirehub.com/opportunities?status=open
 *             (public HTML, no auth required on public tenants)
 *   Detail  : GET https://{tenant}.bonfirehub.com/opportunities/{id}
 *
 * Tenant slugs are the subdomain component of each buyer's Bonfire URL.
 * Example: City of Guelph → guelph.bonfirehub.com → slug "guelph"
 *
 * Catalog status:
 *   The portal catalog currently contains no entries with a bonfirehub.com
 *   domain — IDs are referenced only in portal notes.  The BONFIRE_TENANTS
 *   array below is empty.  When a catalog entry is added that points directly
 *   to a bonfirehub.com URL, add the tenant here and register the
 *   PublicPortalSource in publicPortalProviders.ts.
 *
 * Identity:
 *   externalId = "bonfire-{tenantSlug}-{opportunityId}"
 *   Stable across runs for the same opportunity.
 *
 * Reliability controls:
 *   - Per-request AbortController timeout
 *   - Two retries with exponential back-off for 429/5xx
 *   - Bounded pagination (BONFIRE_MAX_PAGES, default 5)
 *   - Same-run deduplication by externalId
 *   - Partial results preserved when a page fails
 *   - Login-only tenants disabled immediately; direct collection skipped
 */

import { createHash } from "crypto";
import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { positiveIntegerEnv } from "./officialPortalHttp";

// ─── Constants ────────────────────────────────────────────────────────────────

const BONFIRE_BASE_DOMAIN = "bonfirehub.com";
const USER_AGENT = "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)";
const UNKNOWN_POSTED_DATE = new Date(0);

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_MAX_RESULTS = 50;

// Statuses that mean the opportunity is closed / not active.
const CLOSED_STATUSES = new Set([
  "closed", "awarded", "cancelled", "expired", "cancelled - no award",
  "award", "complete", "completed",
]);

// ─── Tenant catalogue ─────────────────────────────────────────────────────────

export interface BonfireTenant {
  /** Must match the portal catalog ID in DirectRfpPortal */
  portalId: string;
  /** Bonfire subdomain slug (e.g. "santacruzca") */
  tenantSlug: string;
  /** Official buyer/government entity name shown to users */
  buyerName: string;
  /** US state code or Canadian province */
  jurisdiction: string;
  /**
   * Whether public listing is accessible without login.
   * false = login-required → direct collection disabled, skip immediately.
   */
  publicListing: boolean;
  skipReason?: string;
}

/**
 * Tenant list derived from portal catalog entries that directly use a
 * bonfirehub.com URL.  Currently empty because the catalog contains no such
 * entries — all Bonfire references are in portal notes only.
 *
 * Add entries here when a catalog entry with domain "*.bonfirehub.com" is
 * registered.
 */
export const BONFIRE_TENANTS: BonfireTenant[] = [
  // No catalog entries with a direct bonfirehub.com URL exist yet.
  // Example of how to add one when available:
  // {
  //   portalId: "tn-montgomery-county-bonfire",
  //   tenantSlug: "montgomerytn",
  //   buyerName: "Montgomery County, TN",
  //   jurisdiction: "TN",
  //   publicListing: true,
  // },
];

export const BONFIRE_TENANT_BY_PORTAL_ID = new Map<string, BonfireTenant>(
  BONFIRE_TENANTS.map((t) => [t.portalId, t]),
);

export const BONFIRE_PORTAL_IDS = new Set<string>(
  BONFIRE_TENANTS.map((t) => t.portalId),
);

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tenantOrigin(slug: string): string {
  return `https://${slug}.${BONFIRE_BASE_DOMAIN}`;
}

function canonicalDetailUrl(tenantSlug: string, opportunityId: string | number): string {
  return `${tenantOrigin(tenantSlug)}/opportunities/${opportunityId}`;
}

function stableId(tenantSlug: string, opportunityId: string | number): string {
  return `bonfire-${tenantSlug}-${opportunityId}`;
}

async function fetchPublic(
  url: string,
  timeoutMs: number,
  maxRetries: number,
  signal: AbortSignal,
  acceptJson = false,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) throw new Error(`Request cancelled: ${url}`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onCancel = () => ctrl.abort();
    signal.addEventListener("abort", onCancel, { once: true });
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          accept: acceptJson
            ? "application/json, text/javascript, */*; q=0.01"
            : "text/html,application/xhtml+xml,*/*;q=0.9",
          "user-agent": USER_AGENT,
          "x-requested-with": acceptJson ? "XMLHttpRequest" : "",
        },
      });
      clearTimeout(timer);
      signal.removeEventListener("abort", onCancel);
      if (res.ok) return res;
      const retryable = res.status === 429 || res.status >= 500;
      const body = await res.text().catch(() => "");
      const msg = `Bonfire [${url}] HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`;
      if (!retryable || attempt >= maxRetries) throw new Error(msg);
      const ra = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
      await sleep(Number.isFinite(ra) ? Math.min(ra * 1000, 12_000) : 500 * 2 ** attempt);
      lastError = new Error(msg);
    } catch (err) {
      clearTimeout(timer);
      signal.removeEventListener("abort", onCancel);
      if (signal.aborted) throw new Error(`Request cancelled: ${url}`);
      const isTimeout = err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
      lastError = isTimeout ? new Error(`Bonfire [${url}] timed out after ${timeoutMs}ms`) : err;
      if (attempt >= maxRetries) break;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Bonfire request failed: ${url}`);
}

// ─── HTML parser helpers ──────────────────────────────────────────────────────

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

function parseDate(value?: string | null): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function isClosedStatus(status?: string | null): boolean {
  if (!status) return false;
  return CLOSED_STATUSES.has(status.toLowerCase().trim());
}

// ─── Bonfire public listing parser ────────────────────────────────────────────
//
// Bonfire renders opportunity cards on the public /opportunities page.
// Each card contains data attributes or JSON-encoded opportunity data.
// We look for the JSON data island first; fall back to card HTML parsing.

interface BonfireOpportunityRaw {
  id?: number | string | null;
  title?: string | null;
  reference_number?: string | null;
  solicitationNumber?: string | null;
  status?: string | null;
  close_datetime?: string | null;
  closeDatetime?: string | null;
  publish_datetime?: string | null;
  publishDatetime?: string | null;
  department?: string | null;
  description?: string | null;
  documents?: Array<{ url?: string; public?: boolean; name?: string }> | null;
}

function extractOpportunitiesFromJson(html: string): BonfireOpportunityRaw[] {
  // Bonfire inlines opportunity data as JSON in multiple patterns
  const patterns = [
    /window\.__NUXT__\s*=\s*\(function[^)]*\)\s*\((\{[\s\S]+?\})\)\s*;?\s*<\/script>/i,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]+?\});\s*<\/script>/i,
    /"opportunities"\s*:\s*(\[[^\]]*\])/,
    /opportunities:\s*(\[[^\]]*\])/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    try {
      const parsed = JSON.parse(match[1]);
      // Handle nested structures
      if (Array.isArray(parsed)) return parsed as BonfireOpportunityRaw[];
      if (Array.isArray(parsed?.opportunities)) return parsed.opportunities as BonfireOpportunityRaw[];
      if (Array.isArray(parsed?.state?.opportunities)) return parsed.state.opportunities as BonfireOpportunityRaw[];
    } catch {
      // Continue to next pattern
    }
  }

  // Try to find all JSON objects that look like opportunity cards
  const cardMatches = Array.from(
    html.matchAll(/data-opportunity=["'](\{[^"']+\})["']/gi),
  );
  if (cardMatches.length > 0) {
    const results: BonfireOpportunityRaw[] = [];
    for (const m of cardMatches) {
      try {
        results.push(JSON.parse(decodeURIComponent(m[1])));
      } catch {
        // Skip malformed
      }
    }
    if (results.length > 0) return results;
  }

  return [];
}

function extractOpportunitiesFromCards(
  html: string,
  pageUrl: string,
  tenantSlug: string,
): BonfireOpportunityRaw[] {
  // Fallback: extract from HTML card blocks
  const results: BonfireOpportunityRaw[] = [];
  const origin = tenantOrigin(tenantSlug);

  // Look for opportunity detail links like /opportunities/123
  const linkPattern = /<a[^>]+href=["']\/opportunities\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seenIds = new Set<string>();

  for (const match of html.matchAll(linkPattern)) {
    const id = match[1];
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    // Extract surrounding card context (500 chars before + 1000 after)
    const pos = match.index ?? 0;
    const cardHtml = html.slice(Math.max(0, pos - 500), pos + match[0].length + 1000);
    const cardText = stripTags(cardHtml);

    // Extract title from anchor text or nearby heading
    const anchorText = stripTags(match[2] ?? "").trim();
    const titleMatch = cardText.match(/(?:^|\n)\s*([A-Z][^.\n]{8,120})/);
    const title = anchorText.length > 8 ? anchorText : (titleMatch?.[1]?.trim() ?? null);

    // Extract dates from card text
    const closingMatch = cardText.match(/(?:clos(?:ing|e)|due|deadline)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
    const postedMatch = cardText.match(/(?:published?|posted|open)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);

    // Extract status
    const statusMatch = cardText.match(/\b(open|closed|awarded|cancelled|expired)\b/i);

    // Extract ref number
    const refMatch = cardText.match(/(?:ref|rfp|rfq|bid|#|no\.?)[:\s#]*([A-Z0-9][A-Z0-9\-./]{2,30})/i);

    results.push({
      id,
      title,
      reference_number: refMatch?.[1] ?? null,
      status: statusMatch?.[1] ?? "open",
      close_datetime: closingMatch?.[1] ?? null,
      publish_datetime: postedMatch?.[1] ?? null,
    });
  }

  return results;
}

function rawToOpportunity(
  raw: BonfireOpportunityRaw,
  tenant: BonfireTenant,
  listingPage: number,
): NormalizedOpportunity | null {
  if (!raw.id) return null;

  const id = String(raw.id);
  const title = raw.title?.trim();
  if (!title) return null;

  if (isClosedStatus(raw.status)) return null;

  const deadline = parseDate(raw.close_datetime ?? raw.closeDatetime);
  if (deadline && deadline < new Date()) return null; // Skip expired

  const posted = parseDate(raw.publish_datetime ?? raw.publishDatetime);
  const solNum = (raw.reference_number ?? raw.solicitationNumber)?.trim() || undefined;
  const description = raw.description?.trim() || undefined;
  const department = raw.department?.trim() || undefined;

  const docUrls = (raw.documents ?? [])
    .filter((d) => d.public !== false && d.url)
    .map((d) => d.url as string)
    .filter(Boolean);

  const externalId = stableId(tenant.tenantSlug, id);
  const sourceUrl = canonicalDetailUrl(tenant.tenantSlug, id);

  return {
    externalId,
    title,
    agency: tenant.buyerName,
    subAgency: department,
    type: "Solicitation",
    status: "active",
    placeOfPerformance: tenant.jurisdiction,
    postedDate: posted ?? UNKNOWN_POSTED_DATE,
    responseDeadline: deadline,
    solicitationNumber: solNum,
    sourceUrl,
    description,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      // Connector identity
      providerFamily: "official_public_portal",
      providerPlatform: "bonfire",
      providerType: "bonfire_direct_adapter",
      discoveryMethod: "dedicated_official_adapter",
      sourceBadge: "Bonfire Procurement Portal",
      sourceConfidence: "high",
      connectorName: "Bonfire / Euna shared adapter",

      // Buyer identity
      sourceId: tenant.portalId,
      buyerName: tenant.buyerName,
      buyerJurisdiction: tenant.jurisdiction,
      tenantSlug: tenant.tenantSlug,

      // Provenance
      bonfireOpportunityId: id,
      listingPage,
      canonicalUrl: sourceUrl,
      originalListingUrl: `${tenantOrigin(tenant.tenantSlug)}/opportunities`,
      collectedAt: new Date().toISOString(),

      // Documents
      documentUrls: docUrls,
      documentCount: docUrls.length,

      // Date quality flags
      dateUnknown: !posted,
      deadlineUnknown: !deadline,

      tags: [
        "direct-official-portal",
        "bonfire-platform",
        `jurisdiction:${tenant.jurisdiction}`,
        `tenant:${tenant.tenantSlug}`,
        `portal:${tenant.portalId}`,
        ...(docUrls.length > 0 ? ["has-public-documents"] : []),
        ...(!posted ? ["date-unknown"] : []),
      ],
    },
  };
}

// ─── Per-tenant collection ────────────────────────────────────────────────────

interface TenantCollectResult {
  records: NormalizedOpportunity[];
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

async function collectTenant(
  tenant: BonfireTenant,
  maxPages: number,
  maxResults: number,
  timeoutMs: number,
  maxRetries: number,
  outerSignal: AbortSignal,
): Promise<TenantCollectResult> {
  if (!tenant.publicListing) {
    return {
      records: [],
      skipped: true,
      skipReason: tenant.skipReason ?? "login-required: direct collection disabled",
    };
  }

  const origin = tenantOrigin(tenant.tenantSlug);
  const records: NormalizedOpportunity[] = [];
  const seenIds = new Set<string>();

  for (let page = 1; page <= maxPages && records.length < maxResults; page++) {
    if (outerSignal.aborted) {
      return { records, error: "cancelled" };
    }

    const url = `${origin}/opportunities?status=open${page > 1 ? `&page=${page}` : ""}`;

    let html: string;
    try {
      const res = await fetchPublic(url, timeoutMs, maxRetries, outerSignal);
      html = await res.text();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { records, error: reason };
    }

    // Detect login wall
    if (/log\s*in\s*to\s*continue|sign\s*in\s*to\s*view|please\s*log\s*in/i.test(html)) {
      return {
        records,
        skipped: true,
        skipReason: "login-required: listing page redirected to login",
      };
    }

    // Try JSON extraction first, then HTML card fallback
    let rawItems = extractOpportunitiesFromJson(html);
    if (rawItems.length === 0) {
      rawItems = extractOpportunitiesFromCards(html, url, tenant.tenantSlug);
    }

    if (rawItems.length === 0) {
      // Empty page = end of results
      break;
    }

    for (const raw of rawItems) {
      const opp = rawToOpportunity(raw, tenant, page);
      if (!opp) continue;
      if (seenIds.has(opp.externalId)) continue;
      seenIds.add(opp.externalId);
      records.push(opp);
      if (records.length >= maxResults) break;
    }

    // If fewer items than a full page, we're done
    if (rawItems.length < 10) break;
  }

  return { records };
}

// ─── Concurrency pool ─────────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const slots = Math.min(Math.max(concurrency, 1), items.length || 1);
  await Promise.all(
    Array.from({ length: slots }, async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        const item = items[idx];
        if (item !== undefined) await worker(item);
      }
    }),
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class BonfirePortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  constructor(private readonly tenants: readonly BonfireTenant[] = BONFIRE_TENANTS) {}

  async isConfigured(): Promise<boolean> {
    // No credentials needed — public API
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const maxPages = positiveIntegerEnv("BONFIRE_MAX_PAGES", DEFAULT_MAX_PAGES, 1, 20);
    const maxResults = positiveIntegerEnv("BONFIRE_MAX_RESULTS", DEFAULT_MAX_RESULTS, 1, 500);
    const concurrency = positiveIntegerEnv("BONFIRE_CONCURRENCY", 3, 1, 10);
    const timeoutMs = positiveIntegerEnv("BONFIRE_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("BONFIRE_MAX_RETRIES", DEFAULT_MAX_RETRIES, 0, 5);

    const limit = Math.max(options.limit ?? (this.tenants.length * maxResults), 1);
    const outerCtrl = new AbortController();

    const allRecords: NormalizedOpportunity[] = [];
    const allErrors: string[] = [];
    const globalSeen = new Set<string>();

    const collectible = this.tenants.filter((t) => t.publicListing);

    await runWithConcurrency(collectible, concurrency, async (tenant) => {
      const result = await collectTenant(
        tenant, maxPages, maxResults, timeoutMs, maxRetries, outerCtrl.signal,
      );

      if (result.skipped) {
        allErrors.push(`${tenant.portalId}: skipped — ${result.skipReason}`);
        return;
      }
      if (result.error) {
        allErrors.push(`${tenant.portalId}: ${result.error}`);
      }
      for (const rec of result.records) {
        if (globalSeen.has(rec.externalId)) continue;
        globalSeen.add(rec.externalId);
        allRecords.push(rec);
        if (allRecords.length >= limit) return;
      }
    });

    const records = allRecords.slice(0, limit);
    return { records, total: records.length, errors: allErrors };
  }

  async getStatus(): Promise<ProviderStatus> {
    const activeTenants = this.tenants.filter((t) => t.publicListing).length;
    return {
      name: "publicPortalProviders",
      configured: true,
      healthy: true,
      recordCount: activeTenants,
    };
  }
}

export const bonfirePortalProvider = new BonfirePortalProvider();

/** Per-portal-ID single-tenant factory for SOURCE_ADAPTERS registration */
export function bonFireTenantProvider(portalId: string): DataSourceProvider | undefined {
  const tenant = BONFIRE_TENANT_BY_PORTAL_ID.get(portalId);
  if (!tenant) return undefined;
  return new BonfirePortalProvider([tenant]);
}
