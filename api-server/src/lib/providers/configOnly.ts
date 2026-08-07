import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import type { ProviderName } from "../config/providerConfig";
import { resolveCredential } from "../config/providerConfig";

interface ConfigFieldCheck {
  dbKey: string;
  envKey: string;
}

/**
 * Lightweight provider for credentials/connectors that are exposed in Settings
 * and available to future pipelines, but do not directly fetch opportunities yet.
 */
export class ConfigOnlyProvider implements DataSourceProvider {
  readonly name: ProviderName;
  private readonly fields: ConfigFieldCheck[];

  constructor(name: ProviderName, fields: ConfigFieldCheck[]) {
    this.name = name;
    this.fields = fields;
  }

  async isConfigured(): Promise<boolean> {
    if (this.fields.length === 0) return true;
    const values = await Promise.all(
      this.fields.map((field) =>
        resolveCredential(field.dbKey, field.envKey),
      ),
    );
    return values.every(Boolean);
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }
}

/**
 * Explicit tombstone for integrations removed from runtime ownership. Keeping a
 * non-operational registry entry preserves the ProviderName exhaustiveness
 * contract without accidentally reactivating legacy code through getProvider().
 */
export class RetiredProvider implements DataSourceProvider {
  readonly name: ProviderName;
  private readonly reason: string;

  constructor(name: ProviderName, reason: string) {
    this.name = name;
    this.reason = reason;
  }

  async isConfigured(): Promise<boolean> {
    return false;
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    return {
      records: [],
      total: 0,
      errors: [`${this.name} is retired: ${this.reason}`],
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: false,
      healthy: false,
      errorMessage: `Retired: ${this.reason}`,
    };
  }
}

export const falProvider = new ConfigOnlyProvider("fal", [
  { dbKey: "falApiKey", envKey: "FAL_API_KEY" },
]);
export const mongoDbProvider = new ConfigOnlyProvider("mongoDb", [
  { dbKey: "mongoDbApi", envKey: "MONGO_DB_API" },
]);
export const retiredLocalLlmProvider = new RetiredProvider(
  "localLlm",
  "self-hosted Ollama/LocalAI extraction was removed from the hardened production runtime",
);
