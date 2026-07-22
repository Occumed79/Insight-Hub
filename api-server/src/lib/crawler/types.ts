import type { NormalizedOpportunity } from "../providers/types";
import type { PublicPortalSource } from "../providers/publicPortalProviders/catalog";

export type SpiderKind =
  | "static_listing"
  | "feed"
  | "json_endpoint"
  | "document"
  | "browser_discovery"
  | "portal_family";

export type CrawlOutcome =
  | "success"
  | "no_results"
  | "not_modified"
  | "deferred"
  | "blocked"
  | "failed";

export interface CrawlLimits {
  maxPages: number;
  maxUrls: number;
  maxBytes: number;
  maxDepth: number;
  maxRedirects: number;
  requestTimeoutMs: number;
  elapsedMs: number;
  minDomainIntervalMs: number;
  maxRetries: number;
}

export const DEFAULT_CRAWL_LIMITS: CrawlLimits = {
  maxPages: 5,
  maxUrls: 100,
  maxBytes: 1_000_000,
  maxDepth: 2,
  maxRedirects: 3,
  requestTimeoutMs: 10_000,
  elapsedMs: 45_000,
  minDomainIntervalMs: 1_000,
  maxRetries: 2,
};

export interface SpiderFieldMap {
  id?: string[];
  title: string[];
  agency?: string[];
  description?: string[];
  solicitationNumber?: string[];
  postedDate?: string[];
  responseDeadline?: string[];
  status?: string[];
  detailUrl?: string[];
  location?: string[];
  type?: string[];
}

interface BaseSpiderConfig {
  id: string;
  sourceId: string;
  kind: SpiderKind;
  enabled: boolean;
  startUrls: string[];
  allowedHosts: string[];
  limits?: Partial<CrawlLimits>;
  scheduleMinutes?: number;
  notes?: string;
}

export interface StaticListingSpiderConfig extends BaseSpiderConfig {
  kind: "static_listing";
  detailLinkPattern?: string;
}

export interface FeedSpiderConfig extends BaseSpiderConfig {
  kind: "feed";
}

export interface JsonEndpointSpiderConfig extends BaseSpiderConfig {
  kind: "json_endpoint";
  endpointUrl: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  recordsPath?: string;
  pagination?: {
    mode: "page" | "offset" | "cursor" | "none";
    parameter?: string;
    pageSizeParameter?: string;
    pageSize?: number;
    cursorPath?: string;
  };
  fields: SpiderFieldMap;
}

export interface DocumentSpiderConfig extends BaseSpiderConfig {
  kind: "document";
  documentPattern?: string;
}

export interface BrowserDiscoverySpiderConfig extends BaseSpiderConfig {
  kind: "browser_discovery";
  searchText?: string;
  activateOpportunityTab?: boolean;
  activateFilterText?: string;
  paginateOnce?: boolean;
  maxResponses?: number;
}

export interface PortalFamilySpiderConfig extends BaseSpiderConfig {
  kind: "portal_family";
  family: string;
  delegateSpiderId: string;
}

export type SpiderConfig =
  | StaticListingSpiderConfig
  | FeedSpiderConfig
  | JsonEndpointSpiderConfig
  | DocumentSpiderConfig
  | BrowserDiscoverySpiderConfig
  | PortalFamilySpiderConfig;

export interface CrawlFrontierState {
  sourceId: string;
  spiderId: string;
  nextRunAt: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastOutcome?: CrawlOutcome;
  lastError?: string;
  consecutiveFailures: number;
  etag?: string;
  lastModified?: string;
  contentHash?: string;
  cursor?: string;
  pagesCrawled: number;
  urlsVisited: number;
  recordsFound: number;
  updatedAt: string;
}

export interface CrawlFetchResult {
  url: string;
  status: number;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  text: string;
  notModified: boolean;
}

export interface CrawlDiagnostics {
  spiderId: string;
  sourceId: string;
  kind: SpiderKind;
  startedAt: string;
  completedAt?: string;
  pagesCrawled: number;
  urlsVisited: number;
  bytesRead: number;
  retries: number;
  discoveredUrls: string[];
  errors: string[];
  dynamicEndpoints?: unknown[];
}

export interface SpiderRunContext {
  source: PublicPortalSource;
  config: SpiderConfig;
  limits: CrawlLimits;
  signal?: AbortSignal;
  frontier?: CrawlFrontierState;
  fetchText(url: string, init?: RequestInit): Promise<CrawlFetchResult>;
  recordDiscoveredUrl(url: string): void;
}

export interface SpiderRunResult {
  outcome: CrawlOutcome;
  records: NormalizedOpportunity[];
  diagnostics: CrawlDiagnostics;
  etag?: string;
  lastModified?: string;
  contentHash?: string;
  cursor?: string;
}

export interface PortalSpider {
  readonly kind: SpiderKind;
  run(context: SpiderRunContext): Promise<SpiderRunResult>;
}
