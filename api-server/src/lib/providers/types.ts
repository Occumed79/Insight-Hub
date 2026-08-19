import type { ProviderName } from "../config/providerConfig";

/**
 * Historical opportunity rows may legitimately retain provenance from retired
 * services. These literals are evidence labels only: they are deliberately NOT
 * members of ProviderName and therefore cannot enter provider configuration,
 * registry, health, or autonomous ingestion routing.
 */
export type LegacyOpportunitySource = "serper" | "olostep";
export type OpportunitySource = ProviderName | LegacyOpportunitySource;

/**
 * Normalized opportunity record from any active provider or historical source.
 * Active providers must map their data to this shape.
 */
export interface NormalizedOpportunity {
  externalId: string;
  title: string;
  agency: string;
  subAgency?: string;
  type: string;
  status: "active" | "archived";
  naicsCode?: string;
  naicsDescription?: string;
  postedDate: Date;
  responseDeadline?: Date;
  setAside?: string;
  placeOfPerformance?: string;
  location?: string;
  description?: string;
  solicitationNumber?: string;
  sourceUrl?: string;
  estimatedValue?: number;
  awardAmount?: number;
  awardee?: string;
  source: OpportunitySource;
  providerName?: string;
  rawData?: Record<string, unknown>;
}

/**
 * Result of a provider fetch operation. Diagnostics are deliberately optional
 * and contain only non-secret operational metadata suitable for run telemetry.
 */
export interface ProviderFetchResult {
  records: NormalizedOpportunity[];
  total: number;
  errors: string[];
  diagnostics?: Record<string, unknown>;
}

export type ProviderProgressPhase =
  | "source_start"
  | "source_retry"
  | "source_complete"
  | "source_failed"
  | "discovery_start"
  | "discovery_complete";

/**
 * Optional progress emitted by multi-source providers. Progress persistence is
 * best-effort and must never be allowed to fail the underlying collection.
 */
export interface ProviderProgressEvent {
  provider: ProviderName;
  phase: ProviderProgressPhase;
  sourceId?: string;
  sourceName?: string;
  index?: number;
  total?: number;
  attempt?: number;
  recordCount?: number;
  error?: string;
}

/**
 * Status of an active/configurable provider (for display in Settings).
 */
export interface ProviderStatus {
  name: ProviderName;
  configured: boolean;
  healthy: boolean;
  errorMessage?: string;
  lastAttempt?: Date;
  lastSuccess?: Date;
  recordCount?: number;
}

/**
 * Options passed to a provider's fetch method.
 */
export interface FetchOptions {
  keywords?: string;
  dateRange?: number; // days
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
  onProgress?: (event: ProviderProgressEvent) => void | Promise<void>;
}

/**
 * Every active data source provider must implement this interface.
 */
export interface DataSourceProvider {
  readonly name: ProviderName;

  /** Check whether the provider is configured (credentials present). */
  isConfigured(): Promise<boolean>;

  /** Fetch normalized opportunity records from this source. */
  fetch(options: FetchOptions): Promise<ProviderFetchResult>;

  /** Get current provider health/status for display in Settings. */
  getStatus(): Promise<ProviderStatus>;
}
