/**
 * Jina AI Provider
 *
 * Role: Web content extraction via Jina Reader API (r.jina.ai).
 * Converts any URL into clean markdown — great fallback/complement to FireCrawl
 * for extracting full page content before AI analysis.
 *
 * API docs: https://jina.ai/reader/
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const JINA_READER_BASE = "https://r.jina.ai/";
const JINA_EMBEDDINGS_URL = "https://api.jina.ai/v1/embeddings";
const JINA_EMBEDDING_MODEL = "jina-embeddings-v3";

export class JinaProvider implements DataSourceProvider {
  readonly name = "jina" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("jinaApiKey", "JINA_API_KEY");
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    // Jina is a utility provider (URL → content), not a direct data source
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    let healthy = false;
    let errorMessage: string | undefined;

    if (configured) {
      try {
        // Light test: fetch a known URL
        const result = await this.extractUrl("https://example.com", 2000);
        healthy = result !== null && result.length > 10;
      } catch (e) {
        errorMessage = e instanceof Error ? e.message : "Unknown error";
      }
    }

    return { name: this.name, configured, healthy, errorMessage };
  }

  /**
   * Extract clean text content from a URL using Jina Reader.
   * Returns markdown string or null on failure.
   */
  async extractUrl(url: string, maxLength = 8000): Promise<string | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;

    try {
      const response = await fetch(`${JINA_READER_BASE}${encodeURIComponent(url)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "text/plain",
          "X-Return-Format": "markdown",
          "X-Timeout": "10",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) return null;

      const text = await response.text();
      return text.slice(0, maxLength);
    } catch {
      return null;
    }
  }

  /**
   * Embed one or more texts with Jina's embeddings API (jina-embeddings-v3).
   * Returns one vector per input (aligned by index), or null if unavailable.
   * Used for semantic re-ranking of opportunities against an ideal profile.
   */
  async embed(texts: string[], task: "retrieval.query" | "retrieval.passage" = "retrieval.passage"): Promise<number[][] | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey || texts.length === 0) return null;

    try {
      const response = await fetch(JINA_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: JINA_EMBEDDING_MODEL,
          task,
          input: texts.map((t) => t.slice(0, 2000)),
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) return null;

      const json = (await response.json()) as { data?: { index: number; embedding: number[] }[] };
      const data = json.data;
      if (!data?.length) return null;

      // Re-order defensively by the API-provided index so vectors align to inputs.
      const out: (number[] | undefined)[] = new Array(texts.length).fill(undefined);
      for (const item of data) {
        if (item.index >= 0 && item.index < texts.length && Array.isArray(item.embedding)) {
          out[item.index] = item.embedding;
        }
      }
      if (out.some((v) => v === undefined)) return null;
      return out as number[][];
    } catch {
      return null;
    }
  }

  /**
   * Extract content from multiple URLs in parallel (limited concurrency).
   */
  async extractUrls(
    urls: string[],
    concurrency = 3,
    maxLength = 6000
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const extracted = await Promise.allSettled(
        batch.map((url) => this.extractUrl(url, maxLength).then((text) => ({ url, text })))
      );

      for (const r of extracted) {
        if (r.status === "fulfilled" && r.value.text) {
          results.set(r.value.url, r.value.text);
        }
      }
    }

    return results;
  }
}

export const jinaProvider = new JinaProvider();
