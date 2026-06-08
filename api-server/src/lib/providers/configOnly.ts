import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
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
    const values = await Promise.all(this.fields.map((field) => resolveCredential(field.dbKey, field.envKey)));
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

export const cohereProvider = new ConfigOnlyProvider("cohere", [{ dbKey: "cohereApiKey", envKey: "COHERE_API_KEY" }]);
export const falProvider = new ConfigOnlyProvider("fal", [{ dbKey: "falApiKey", envKey: "FAL_API_KEY" }]);
export const pineconeProvider = new ConfigOnlyProvider("pinecone", [{ dbKey: "pineconeApiKey", envKey: "PINECONE_API_KEY" }]);
export const qdrantProvider = new ConfigOnlyProvider("qdrant", [
  { dbKey: "qdrantUrl", envKey: "QDRANT_URL" },
  { dbKey: "qdrantApiKey", envKey: "QDRANT_API_KEY" },
]);
export const cloudflareWorkerProvider = new ConfigOnlyProvider("cloudflareWorker", [{ dbKey: "cloudflareWorkerApi", envKey: "CLOUDFLARE_WORKER_API" }]);
export const mongoDbProvider = new ConfigOnlyProvider("mongoDb", [{ dbKey: "mongoDbApi", envKey: "MONGO_DB_API" }]);
export const voyageProvider = new ConfigOnlyProvider("voyage", [{ dbKey: "voyageApiKey", envKey: "VOYAGE_API_KEY" }]);
export const huggingFaceProvider = new ConfigOnlyProvider("huggingFace", [{ dbKey: "huggingFaceApiKey", envKey: "HUGGINGFACE_API_KEY" }]);
export const federalRegisterProvider = new ConfigOnlyProvider("federalRegister", []);