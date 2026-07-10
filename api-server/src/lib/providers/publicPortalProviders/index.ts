import { nyScrProvider } from "../nyScr";
import { texasEsbdProvider } from "../texasEsbd";
import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "../types";
import { PUBLIC_PORTAL_SOURCES, type PublicPortalSource, validatePublicPortalSource } from "./catalog";
import { extractPdfLinkOpportunities, extractStaticHtmlOpportunities, withPublicPortalMetadata } from "./genericExtractors";

export interface PublicPortalSourceRunStatus {
  sourceId: string;
  lastCheckedAt: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastFailureReason?: string;
  resultCount: number;
  matchedCount: number;
}

const DEFAULT_LIMIT = 100;
const MIN_DOMAIN_INTERVAL_MS = 1_000;
const lastDomainFetchAt = new Map<string, number>();
const sourceStatuses = new Map<string, PublicPortalSourceRunStatus>();

function isOccuMedMatch(record: NormalizedOpportunity): boolean {
  return Boolean(record.rawData?.occuMedMatched);
}

async function waitForDomainRateLimit(domain: string): Promise<void> {
  const lastFetchAt = lastDomainFetchAt.get(domain) ?? 0;
  const waitMs = Math.max(0, MIN_DOMAIN_INTERVAL_MS - (Date.now() - lastFetchAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastDomainFetchAt.set(domain, Date.now());
}

async function fetchHtml(source: PublicPortalSource): Promise<string> {
  await waitForDomainRateLimit(source.domain);
  const response = await fetch(source.sourceUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "OccuMed-InsightHub/1.0 public procurement catalog crawler (+https://www.occumed.com)",
    },
  });
  if (!response.ok) throw new Error(`${source.id} returned HTTP ${response.status}`);
  return response.text();
}

async function runExistingParser(source: PublicPortalSource, options: FetchOptions): Promise<NormalizedOpportunity[]> {
  if (source.id === "texasEsbd") return (await texasEsbdProvider.fetch(options)).records.map((record) => withPublicPortalMetadata(record, source));
  if (source.id === "nyScr") return (await nyScrProvider.fetch(options)).records.map((record) => withPublicPortalMetadata(record, source));
  throw new Error(`No existing parser is registered for public portal source ${source.id}`);
}

async function runSource(source: PublicPortalSource, options: FetchOptions): Promise<NormalizedOpportunity[]> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT);
  if (source.scraperType === "existing_parser") return runExistingParser(source, { ...options, limit });
  if (source.scraperType === "static_html") return extractStaticHtmlOpportunities(await fetchHtml(source), source, limit);
  if (source.scraperType === "pdf_links") return extractPdfLinkOpportunities(await fetchHtml(source), source, limit);
  if (source.scraperType === "scrapy") throw new Error(`Scrapy source ${source.id} is reserved until a real spider is added`);
  if (source.scraperType === "playwright_public") throw new Error(`Playwright source ${source.id} is reserved until a real public-page runner is added`);
  if (source.scraperType === "rss" || source.scraperType === "public_json") throw new Error(`${source.scraperType} source ${source.id} needs a concrete adapter before it can run`);
  return [];
}

export class PublicPortalProvidersProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  constructor(private readonly sources: PublicPortalSource[] = PUBLIC_PORTAL_SOURCES) {}

  async isConfigured(): Promise<boolean> { return true; }

  getSources(): PublicPortalSource[] { return this.sources; }

  getSourceStatuses(): PublicPortalSourceRunStatus[] { return Array.from(sourceStatuses.values()); }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const enabledSources = this.sources.filter(
      (source) => source.enabled && source.verificationStatus === "verified",
    );
    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];

    for (const source of enabledSources) {
      const validationErrors = validatePublicPortalSource(source);
      const lastCheckedAt = new Date();
      if (validationErrors.length) {
        const reason = validationErrors.join("; ");
        errors.push(`${source.id}: ${reason}`);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastFailureAt: lastCheckedAt, lastFailureReason: reason, resultCount: 0, matchedCount: 0 });
        continue;
      }

      try {
        const sourceRecords = await runSource(source, options);
        records.push(...sourceRecords);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastSuccessAt: new Date(), resultCount: sourceRecords.length, matchedCount: sourceRecords.filter(isOccuMedMatch).length });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(`${source.id}: ${reason}`);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastFailureAt: new Date(), lastFailureReason: reason, resultCount: 0, matchedCount: 0 });
      }
    }

    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    const statuses = Array.from(sourceStatuses.values());
    return { name: this.name, configured: true, healthy: !statuses.some((status) => status.lastFailureAt), recordCount: statuses.reduce((sum, status) => sum + status.resultCount, 0) };
  }
}

export const publicPortalProvidersProvider = new PublicPortalProvidersProvider();
export * from "./catalog";
export * from "./genericExtractors";
