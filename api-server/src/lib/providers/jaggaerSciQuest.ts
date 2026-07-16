import { createHash } from "node:crypto";
import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import {
  extractSameOriginPaginationUrls,
  fetchOfficialPortalText,
  positiveIntegerEnv,
} from "./officialPortalHttp";

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_MAX_RESULTS_PER_TENANT = 100;

export type JaggaerCapability = "dedicated_listing" | "login_required";

export interface JaggaerTenant {
  portalId: string;
  tenantSlug: string;
  customerOrg?: string;
  buyerName: string;
  state: string;
  country: string;
  listingUrl: string;
  origin: string;
  capability: JaggaerCapability;
}

export const JAGGAER_SCIQUEST_TENANTS: JaggaerTenant[] = [
  {
    portalId: "ia-das",
    tenantSlug: "dasiowa",
    customerOrg: "DASIowa",
    buyerName: "State of Iowa",
    state: "IA",
    country: "US",
    listingUrl: "https://bids.sciquest.com/apps/Router/PublicEvent?CustomerOrg=DASIowa",
    origin: "https://bids.sciquest.com",
    capability: "dedicated_listing",
  },
  {
    portalId: "ca-ontario-tenders",
    tenantSlug: "ontario-tenders",
    buyerName: "Ontario Tenders Portal",
    state: "ON",
    country: "CA",
    listingUrl: "https://ontariotenders.app.jaggaer.com/esop/nac-host/public/web/login.html",
    origin: "https://ontariotenders.app.jaggaer.com",
    capability: "login_required",
  },
];

export const JAGGAER_COLLECTIBLE_PORTAL_IDS = new Set(
  JAGGAER_SCIQUEST_TENANTS
    .filter((tenant) => tenant.capability === "dedicated_listing")
    .map((tenant) => tenant.portalId),
);

const TENANT_BY_PORTAL_ID = new Map(
  JAGGAER_SCIQUEST_TENANTS.map((tenant) => [tenant.portalId, tenant]),
);

interface HtmlLine {
  text: string;
  href?: string;
}

interface ParsedJaggaerEvent {
  title: string;
  description?: string;
  postedDate?: Date;
  responseDeadline?: Date;
  type?: string;
  solicitationNumber?: string;
  contactName?: string;
  contactEmail?: string;
  detailUrl?: string;
  publicDocumentUrl?: string;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function stripMarkup(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value: string, baseUrl: string): string | undefined {
  try {
    const url = new URL(decodeHtmlEntities(value), baseUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function htmlToLines(html: string, pageUrl: string): HtmlLine[] {
  const links: HtmlLine[] = [];
  let working = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");

  working = working.replace(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, inner: string) => {
      const index = links.length;
      links.push({
        text: stripMarkup(inner),
        href: absoluteUrl(href, pageUrl),
      });
      return `\n__JAGGAER_LINK_${index}__\n`;
    },
  );

  working = working
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|li|section|article|tr|td|th|h[1-6])\s*>/gi, "\n")
    .replace(/<(?:div|p|li|section|article|tr|td|th|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const lines: HtmlLine[] = [];
  for (const rawLine of working.split(/\r?\n/)) {
    const text = decodeHtmlEntities(rawLine).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const token = text.match(/^__JAGGAER_LINK_(\d+)__$/);
    if (token) {
      const link = links[Number(token[1])];
      if (link?.text) lines.push(link);
      continue;
    }
    lines.push({ text });
  }
  return lines;
}

function parsePublicDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeType(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) return "Solicitation";
  const lower = normalized.toLowerCase();
  if (lower.includes("rfp")) return "RFP";
  if (lower.includes("rfq")) return "RFQ";
  if (lower.includes("rfi")) return "RFI";
  if (lower.includes("bid") || lower.includes("ifb") || lower.includes("itb") || lower.includes("rfb")) return "Bid";
  return normalized;
}

function lineValueAfterLabel(lines: HtmlLine[], label: string, start: number, end: number): string | undefined {
  for (let index = start; index < end - 1; index += 1) {
    if (lines[index]?.text.toLowerCase() !== label.toLowerCase()) continue;
    return lines[index + 1]?.text;
  }
  return undefined;
}

function lineIndexWithDateAfter(lines: HtmlLine[], text: string, start: number, end: number): number {
  for (let index = start; index < end - 1; index += 1) {
    if (lines[index]?.text.toLowerCase() !== text.toLowerCase()) continue;
    if (parsePublicDate(lines[index + 1]?.text)) return index;
  }
  return -1;
}

function isEventLink(line: HtmlLine | undefined): boolean {
  return Boolean(line?.href && /\/apps\/Router\/ViewSourcingEvent\b/i.test(line.href));
}

function nextEventStart(lines: HtmlLine[], start: number): number {
  for (let index = start; index < lines.length - 1; index += 1) {
    if (lines[index]?.text.toLowerCase() === "open" && isEventLink(lines[index + 1])) return index;
  }
  return lines.length;
}

export function parseJaggaerPublicEventHtml(html: string, pageUrl: string): ParsedJaggaerEvent[] {
  const lines = htmlToLines(html, pageUrl);
  const events: ParsedJaggaerEvent[] = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (lines[index]?.text.toLowerCase() !== "open" || !isEventLink(lines[index + 1])) continue;

    const detailLine = lines[index + 1];
    const end = nextEventStart(lines, index + 2);
    const postedLabelIndex = lineIndexWithDateAfter(lines, "Open", index + 2, end);
    const closeLabelIndex = lineIndexWithDateAfter(lines, "Close", Math.max(postedLabelIndex + 1, index + 2), end);
    if (postedLabelIndex < 0 || closeLabelIndex < 0) {
      index = end - 1;
      continue;
    }

    const description = lines
      .slice(index + 2, postedLabelIndex)
      .map((line) => line.text)
      .filter((text) => text && text !== detailLine.text)
      .join(" ")
      .trim();

    const contact = lineValueAfterLabel(lines, "Contact", closeLabelIndex + 1, end);
    const email = contact?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    const contactName = contact && email ? contact.replace(email, "").trim() : contact?.trim();
    const documentLine = lines
      .slice(closeLabelIndex + 1, end)
      .find((line) => line.href && (/view as pdf/i.test(line.text) || /\.pdf(?:$|[?#])/i.test(line.href)));

    events.push({
      title: detailLine.text.trim(),
      description: description || undefined,
      postedDate: parsePublicDate(lines[postedLabelIndex + 1]?.text),
      responseDeadline: parsePublicDate(lines[closeLabelIndex + 1]?.text),
      type: lineValueAfterLabel(lines, "Type", closeLabelIndex + 1, end),
      solicitationNumber: lineValueAfterLabel(lines, "Number", closeLabelIndex + 1, end),
      contactName: contactName || undefined,
      contactEmail: email,
      detailUrl: detailLine.href,
      publicDocumentUrl: documentLine?.href,
    });

    index = end - 1;
  }

  return events;
}

function stableJaggaerId(tenant: JaggaerTenant, event: ParsedJaggaerEvent): string {
  const nativeKey = event.solicitationNumber?.trim()
    || event.publicDocumentUrl
    || event.detailUrl
    || `${event.title}|${event.responseDeadline?.toISOString() ?? ""}`;
  const readable = event.solicitationNumber
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (readable) return `jaggaer-${tenant.tenantSlug}-${readable}`;
  const hash = createHash("sha256").update(nativeKey).digest("hex").slice(0, 24);
  return `jaggaer-${tenant.tenantSlug}-${hash}`;
}

function keywordMatch(event: ParsedJaggaerEvent, tenant: JaggaerTenant, keywords: string | undefined): boolean {
  const terms = keywords
    ?.toLowerCase()
    .split(/[\s,]+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (!terms?.length) return true;
  const haystack = [
    event.title,
    event.description,
    event.solicitationNumber,
    event.type,
    event.contactName,
    tenant.buyerName,
  ].filter(Boolean).join(" ").toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function eventToOpportunity(
  event: ParsedJaggaerEvent,
  tenant: JaggaerTenant,
  listingUrl: string,
  listingPage: number,
): NormalizedOpportunity {
  const postedDate = event.postedDate;
  const documents = event.publicDocumentUrl ? [event.publicDocumentUrl] : [];
  return {
    externalId: stableJaggaerId(tenant, event),
    title: event.title,
    agency: tenant.buyerName,
    type: normalizeType(event.type),
    status: "active",
    postedDate: postedDate ?? new Date(0),
    responseDeadline: event.responseDeadline,
    placeOfPerformance: tenant.state,
    description: event.description,
    solicitationNumber: event.solicitationNumber,
    sourceUrl: event.publicDocumentUrl || event.detailUrl || listingUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_portal",
      providerPlatform: "jaggaer_sciquest",
      providerType: "jaggaer_public_event_listing",
      connectorName: "Jaggaer/SciQuest shared adapter",
      discoveryMethod: "dedicated_official_adapter",
      sourceBadge: "Jaggaer Official Portal",
      sourceConfidence: "high",
      sourceId: tenant.portalId,
      buyerName: tenant.buyerName,
      buyerState: tenant.state,
      buyerCountry: tenant.country,
      tenantSlug: tenant.tenantSlug,
      customerOrg: tenant.customerOrg,
      listingUrl,
      listingPage,
      paginationMode: "bounded_same_origin",
      officialDetailUrl: event.detailUrl,
      documentUrls: documents,
      documentCount: documents.length,
      documentsRequireLogin: false,
      contactName: event.contactName,
      contactEmail: event.contactEmail,
      dateUnknown: !postedDate,
      deadlineUnknown: !event.responseDeadline,
      collectedAt: new Date().toISOString(),
      tags: [
        "direct-official-portal",
        "jaggaer-sciquest-platform",
        `state:${tenant.state}`,
        `tenant:${tenant.tenantSlug}`,
        `portal:${tenant.portalId}`,
        ...(documents.length ? ["has-public-documents"] : []),
        ...(!postedDate ? ["date-unknown"] : []),
      ],
    },
  };
}

interface TenantCollectionResult {
  records: NormalizedOpportunity[];
  errors: string[];
}

async function collectTenant(tenant: JaggaerTenant, options: FetchOptions): Promise<TenantCollectionResult> {
  if (tenant.capability !== "dedicated_listing") {
    return { records: [], errors: [`${tenant.portalId}: public opportunity collection requires login`] };
  }

  const timeoutMs = positiveIntegerEnv("JAGGAER_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, 3_000, 60_000);
  const maxRetries = positiveIntegerEnv("JAGGAER_MAX_RETRIES", DEFAULT_MAX_RETRIES, 0, 5);
  const maxPages = positiveIntegerEnv("JAGGAER_MAX_PAGES", DEFAULT_MAX_PAGES, 1, 20);
  const maxResults = positiveIntegerEnv("JAGGAER_MAX_RESULTS_PER_TENANT", DEFAULT_MAX_RESULTS_PER_TENANT, 1, 500);
  const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
  const queue = [tenant.listingUrl];
  const seenPages = new Set<string>();
  const seenPageSignatures = new Set<string>();
  const seenRecords = new Set<string>();
  const records: NormalizedOpportunity[] = [];
  const errors: string[] = [];
  let listingPage = 0;

  while (queue.length && listingPage < maxPages && records.length < requestedLimit) {
    const pageUrl = queue.shift();
    if (!pageUrl) break;
    const pageKey = pageUrl.toLowerCase();
    if (seenPages.has(pageKey)) continue;
    seenPages.add(pageKey);

    let html: string;
    try {
      html = await fetchOfficialPortalText(pageUrl, {
        label: `${tenant.portalId} Jaggaer listing`,
        origin: tenant.origin,
        timeoutMs,
        maxRetries,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push(`${tenant.portalId}: ${reason}`);
      break;
    }

    listingPage += 1;
    const parsedEvents = parseJaggaerPublicEventHtml(html, pageUrl);
    const signature = createHash("sha256")
      .update(parsedEvents.map((event) => `${event.solicitationNumber ?? ""}|${event.title}`).join("\n"))
      .digest("hex");
    if (seenPageSignatures.has(signature)) break;
    seenPageSignatures.add(signature);

    for (const event of parsedEvents) {
      if (!keywordMatch(event, tenant, options.keywords)) continue;
      if (options.dateRange && event.postedDate) {
        const cutoff = Date.now() - options.dateRange * 86_400_000;
        if (event.postedDate.getTime() < cutoff) continue;
      }
      const record = eventToOpportunity(event, tenant, pageUrl, listingPage);
      if (seenRecords.has(record.externalId)) continue;
      seenRecords.add(record.externalId);
      records.push(record);
      if (records.length >= requestedLimit) break;
    }

    if (listingPage >= maxPages || records.length >= requestedLimit) continue;
    const nextUrls = extractSameOriginPaginationUrls(html, pageUrl, tenant.origin, maxPages * 3);
    for (const nextUrl of nextUrls) {
      const nextKey = nextUrl.toLowerCase();
      if (!seenPages.has(nextKey) && !queue.some((queued) => queued.toLowerCase() === nextKey)) queue.push(nextUrl);
    }
  }

  const offset = Math.max(options.offset ?? 0, 0);
  return { records: records.slice(offset, offset + requestedLimit), errors };
}

export class JaggaerSciQuestProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  constructor(private readonly tenants: readonly JaggaerTenant[] = JAGGAER_SCIQUEST_TENANTS) {}

  async isConfigured(): Promise<boolean> {
    return this.tenants.some((tenant) => tenant.capability === "dedicated_listing");
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    for (const tenant of this.tenants) {
      if (tenant.capability !== "dedicated_listing") continue;
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

export function jaggaerSciQuestTenantProvider(portalId: string): DataSourceProvider | undefined {
  const tenant = TENANT_BY_PORTAL_ID.get(portalId);
  if (!tenant || tenant.capability !== "dedicated_listing") return undefined;
  return new JaggaerSciQuestProvider([tenant]);
}

export const jaggaerSciQuestProviders: Record<string, DataSourceProvider> = Object.fromEntries(
  JAGGAER_SCIQUEST_TENANTS
    .filter((tenant) => tenant.capability === "dedicated_listing")
    .map((tenant) => [tenant.portalId, new JaggaerSciQuestProvider([tenant])]),
);
