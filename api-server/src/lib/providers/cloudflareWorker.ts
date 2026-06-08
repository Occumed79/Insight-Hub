import { createHash } from "crypto";
import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

export interface WorkerExtractResult {
  url: string;
  content?: string;
  text?: string;
  markdown?: string;
  title?: string;
  status?: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_QUERY = [
  "occupational health RFP solicitation",
  "drug testing medical exam bid",
  "employee health services procurement",
].join(" OR ");

export class CloudflareWorkerProvider implements DataSourceProvider {
  readonly name = "cloudflareWorker" as const;

  private async getEndpoint(): Promise<string | null> {
    const value = await resolveCredential("cloudflareWorkerApi", "CLOUDFLARE_WORKER_API");
    if (!value) return null;
    return value.replace(/\/$/, "");
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getEndpoint());
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const query = options.keywords?.trim() || DEFAULT_QUERY;
    const limit = Math.min(options.limit ?? 25, 50);
    const results = await this.search(query, limit);
    if (!results) return { records: [], total: 0, errors: ["Cloudflare Worker search failed or returned no results"] };

    const records = results
      .map((item) => this.normalize(item))
      .filter((record): record is NormalizedOpportunity => !!record);

    return { records, total: records.length, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const endpoint = await this.getEndpoint();
    if (!endpoint) return { name: this.name, configured: false, healthy: false };

    try {
      const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(8000) });
      return { name: this.name, configured: true, healthy: response.ok };
    } catch (error) {
      return {
        name: this.name,
        configured: true,
        healthy: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async extractUrl(url: string, maxLength = 8000): Promise<string | null> {
    const endpoint = await this.getEndpoint();
    if (!endpoint) return null;

    try {
      const response = await fetch(`${endpoint}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, maxLength }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) return null;
      const json = (await response.json()) as { content?: string; text?: string; markdown?: string };
      const content = json.content ?? json.markdown ?? json.text;
      return content ? content.slice(0, maxLength) : null;
    } catch {
      return null;
    }
  }

  async search(query: string, limit = 10): Promise<WorkerExtractResult[] | null> {
    const endpoint = await this.getEndpoint();
    if (!endpoint) return null;

    try {
      const response = await fetch(`${endpoint}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) return null;
      const json = (await response.json()) as { results?: WorkerExtractResult[] | WorkerExtractResult; records?: WorkerExtractResult[] };
      if (Array.isArray(json.results)) return json.results;
      if (json.results && !Array.isArray(json.results)) return [json.results];
      return json.records ?? null;
    } catch {
      return null;
    }
  }

  private normalize(item: WorkerExtractResult): NormalizedOpportunity | null {
    const sourceUrl = item.url;
    const content = (item.content ?? item.markdown ?? item.text ?? "").trim();
    if (!sourceUrl && !content) return null;

    const title = item.title?.trim()
      || firstMeaningfulLine(content)
      || hostTitle(sourceUrl)
      || "Cloudflare Worker Opportunity";

    return {
      externalId: `cloudflare-worker-${hash(`${sourceUrl}:${title}`)}`,
      title: title.slice(0, 240),
      agency: extractAgency(content) ?? "Unknown Agency",
      type: "Web-discovered opportunity",
      status: "active",
      postedDate: new Date(),
      description: content ? content.slice(0, 4000) : undefined,
      sourceUrl,
      source: "cloudflareWorker",
      providerName: "Cloudflare Worker API",
      rawData: item as Record<string, unknown>,
    };
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function firstMeaningfulLine(content: string): string | null {
  const line = content.split(/\r?\n/).map((part) => part.trim()).find((part) => part.length >= 12 && part.length <= 240);
  return line ?? null;
}

function hostTitle(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function extractAgency(content: string): string | null {
  const match = content.match(/(?:agency|department|buyer|organization)\s*[:\-]\s*([^\n]{3,120})/i);
  return match?.[1]?.trim() ?? null;
}

export const cloudflareWorkerProvider = new CloudflareWorkerProvider();