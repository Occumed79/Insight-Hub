import type { ProviderName } from "../config/providerConfig";

/**
 * Normalized opportunity record from any provider.
 * All providers must map their data to this shape.
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
  description?: string;
  solicitationNumber?: string;
  sourceUrl?: string;
  estimatedValue?: number;
  awardAmount?: number;
  awardee?: string;
  source: ProviderName;
  rawData?: Record<string, unknown>;
}

/**
 * Result of a provider fetch operation.
 */
export interface ProviderFetchResult {
  records: NormalizedOpportunity[];
  total: number;
  errors: string[];
}

/**
 * Status of a provider (for display in Settings).
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
}

/**
 * Every data source provider must implement this interface.
 */
export interface DataSourceProvider {
  readonly name: ProviderName;

  /**
   * Check whether the provider is configured (credentials present).
   */
  isConfigured(): Promise<boolean>;

  /**
   * Fetch normalized opportunity records from this source.
   * Should throw a descriptive error if not configured or the fetch fails.
   */
  fetch(options: FetchOptions): Promise<ProviderFetchResult>;

  /**
   * Get current provider health/status for display in Settings.
   */
  getStatus(): Promise<ProviderStatus>;
}
