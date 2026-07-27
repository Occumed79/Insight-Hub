import { createHash } from "node:crypto";

import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import {
  OPENGOV_TENANT_BY_PORTAL_ID,
  type OpenGovTenant,
} from "./openGov";
import { fetchOfficialPortalText, positiveIntegerEnv } from "./officialPortalHttp";

const ORIGIN = "https://procurement.opengov.com";
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_LIMIT = 50;
const UNKNOWN_POSTED_DATE = new Date(0);
const CLOSED_STATUS = /\b(?:closed|awarded|cancelled|canceled|expired|complete|completed)\b/i;

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    );
}

function stripTags(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function absoluteProjectUrl(value: string, tenant: OpenGovTenant): string | undefined {
  try {
    const url = new URL(decodeHtml(value), ORIGIN);
    if (url.origin !== ORIGIN) return undefined;
    if (!url.pathname.includes(`/portal/${tenant.tenantSlug}/project/`)) {
      return undefined;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function projectIdFromUrl(value: string): string | undefined {
  try {
    const segments = new URL(value).pathname.split("/").filter(Boolean);
    const index = segments.indexOf("project");
    return index >= 0 ? segments[index + 1] : undefined;
  } catch {
    return undefined;
  }
}

function stableId(tenant: OpenGovTenant, projectUrl: string, title: string): string {
  const projectId = projectIdFromUrl(projectUrl);
  if (projectId) return `opengov-${tenant.tenantSlug}-${projectId}`;
  const hash = createHash("sha256")
    .update(`${tenant.tenantSlug}|${projectUrl}|${title}`)
    .digest("hex")
    .slice(0, 24);
  return `opengov-${tenant.tenantSlug}-${hash}`;
}

function normalizeType(title: string, projectId?: string): string {
  const text = `${title} ${projectId ?? ""}`.toLowerCase();
  if (/\brfp\b|request for proposals?/.test(text)) return "RFP";
  if (/\brfq\b|request for qualifications?|request for quotes?/.test(text)) {
    return "RFQ";
  }
  if (/\brfi\b|request for information/.test(text)) return "RFI";
  if (/\bitb\b|\bifb\b|invitation for bids?|\bbid\b/.test(text)) return "Bid";
  return "Solicitation";
}

function rowToOpportunity(
  rowHtml: string,
  tenant: OpenGovTenant,
): NormalizedOpportunity | undefined {
  const anchors = Array.from(
    rowHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  );
  const projectAnchor = anchors
    .map((match) => ({
      url: absoluteProjectUrl(match[1] ?? "", tenant),
      text: stripTags(match[2] ?? ""),
    }))
    .find((anchor) => anchor.url && anchor.text);
  if (!projectAnchor?.url) return undefined;

  const cells = Array.from(
    rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
  )
    .map((match) => stripTags(match[1] ?? ""))
    .filter(Boolean);
  if (cells.length === 0) return undefined;

  const title = projectAnchor.text || cells[0];
  if (!title) return undefined;
  const projectId = cells.find(
    (cell) =>
      cell !== title &&
      cell.length <= 80 &&
      /[a-z0-9]/i.test(cell) &&
      !/^(?:open|pending|evaluation|closed|awarded|cancelled|canceled)$/i.test(cell) &&
      !parseDate(cell),
  );
  const statusText = cells.find((cell) =>
    /^(?:open|active|pending|evaluation|closed|awarded|cancelled|canceled)$/i.test(
      cell,
    ),
  );
  const dates = cells.map(parseDate).filter((date): date is Date => Boolean(date));
  const postedDate = dates[0];
  const responseDeadline = dates[1] ?? dates[0];

  return {
    externalId: stableId(tenant, projectAnchor.url, title),
    title,
    agency: tenant.buyerName,
    type: normalizeType(title, projectId),
    status: CLOSED_STATUS.test(statusText ?? "") ? "archived" : "active",
    postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline,
    solicitationNumber: projectId,
    placeOfPerformance: tenant.state,
    sourceUrl: projectAnchor.url,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_portal",
      providerPlatform: "opengov",
      providerType: "opengov_public_embed_listing",
      connectorName: "OpenGov shared HTML adapter",
      discoveryMethod: "dedicated_official_adapter",
      sourceBadge: "OpenGov Official Portal",
      sourceConfidence: "high",
      sourceId: tenant.portalId,
      buyerName: tenant.buyerName,
      buyerState: tenant.state,
      tenantSlug: tenant.tenantSlug,
      statusText,
      collectedAt: new Date().toISOString(),
    },
  };
}

export function parseOpenGovProjectListHtml(
  html: string,
  tenant: OpenGovTenant,
): NormalizedOpportunity[] {
  const records: NormalizedOpportunity[] = [];
  const seen = new Set<string>();
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const record = rowToOpportunity(rowMatch[1] ?? "", tenant);
    if (!record || seen.has(record.externalId)) continue;
    seen.add(record.externalId);
    records.push(record);
  }
  return records;
}

class OpenGovHtmlTenantProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  constructor(private readonly tenant: OpenGovTenant) {}

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const timeoutMs = positiveIntegerEnv(
      "OPENGOV_REQUEST_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS,
      3_000,
      60_000,
    );
    const maxRetries = positiveIntegerEnv(
      "OPENGOV_MAX_RETRIES",
      DEFAULT_RETRIES,
      0,
      5,
    );
    const limit = Math.max(options.limit ?? DEFAULT_LIMIT, 1);
    const listingUrl = `${ORIGIN}/portal/embed/${this.tenant.tenantSlug}/project-list?departmentId=all&status=all`;

    try {
      const html = await fetchOfficialPortalText(listingUrl, {
        label: `${this.tenant.buyerName} OpenGov projects`,
        origin: ORIGIN,
        timeoutMs,
        maxRetries,
        signal: options.signal,
      });
      const records = parseOpenGovProjectListHtml(html, this.tenant)
        .filter((record) => record.status === "active")
        .slice(0, limit);
      const explicitEmpty = /\b(?:no projects|no solicitations|no results|nothing found)\b/i.test(
        stripTags(html),
      );
      if (records.length === 0 && !explicitEmpty) {
        return {
          records: [],
          total: 0,
          errors: [
            `${this.tenant.portalId}: OpenGov public listing returned no parseable project rows.`,
          ],
        };
      }
      return { records, total: records.length, errors: [] };
    } catch (error) {
      return {
        records: [],
        total: 0,
        errors: [
          `${this.tenant.portalId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
      };
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: true,
      healthy: true,
    };
  }
}

export function openGovHtmlTenantProvider(
  portalId: string,
): DataSourceProvider | undefined {
  const tenant = OPENGOV_TENANT_BY_PORTAL_ID.get(portalId);
  if (!tenant) return undefined;
  if (
    tenant.capability !== "dedicated_listing" &&
    tenant.capability !== "dedicated_listing_and_detail"
  ) {
    return undefined;
  }
  return new OpenGovHtmlTenantProvider(tenant);
}
