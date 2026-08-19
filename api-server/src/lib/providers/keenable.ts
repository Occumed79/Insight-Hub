import { composeAbortSignal } from "./abortSignals";

const KEENABLE_BASE = "https://api.keenable.ai/v1";
const REQUEST_TIMEOUT_MS = 25_000;

export interface KeenableSearchResult {
  title: string;
  url: string;
  description: string;
  snippet: string;
  publishedAt?: string;
  acquiredAt?: string;
}

export class KeenableProvider {
  readonly name = "keenable" as const;

  private getApiKey(): string | null {
    return process.env.KEENABLE_API_KEY?.trim() || null;
  }

  async isConfigured(): Promise<boolean> {
    return Boolean(this.getApiKey());
  }

  async search(
    query: string,
    options: {
      publishedAfter?: string;
      site?: string;
      signal?: AbortSignal;
    } = {},
  ): Promise<KeenableSearchResult[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("Keenable API key not configured");
    const requestSignal = composeAbortSignal(REQUEST_TIMEOUT_MS, options.signal);
    try {
      const response = await fetch(`${KEENABLE_BASE}/search`, {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          snippet_max_length: 1_500,
          ...(options.publishedAfter
            ? { published_after: options.publishedAfter.slice(0, 10) }
            : {}),
          ...(options.site ? { site: options.site } : {}),
        }),
        signal: requestSignal.signal,
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(
          `Keenable search error ${response.status}: ${body.slice(0, 200)}`,
        );
      }
      const json = JSON.parse(body) as {
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
          snippet?: string;
          published_at?: string | null;
          acquired_at?: string | null;
        }>;
      };
      return (json.results ?? []).flatMap((result) =>
        result.url
          ? [{
              title: result.title ?? result.url,
              url: result.url,
              description: result.description ?? "",
              snippet: result.snippet ?? "",
              publishedAt: result.published_at ?? undefined,
              acquiredAt: result.acquired_at ?? undefined,
            }]
          : [],
      );
    } finally {
      requestSignal.cleanup();
    }
  }

  async fetchText(
    url: string,
    maxLength = 8_000,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;
    const requestSignal = composeAbortSignal(REQUEST_TIMEOUT_MS, signal);
    try {
      const endpoint = new URL(`${KEENABLE_BASE}/fetch`);
      endpoint.searchParams.set("url", url);
      const response = await fetch(endpoint, {
        headers: { "X-API-Key": apiKey },
        signal: requestSignal.signal,
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(
          `Keenable fetch error ${response.status}: ${body.slice(0, 200)}`,
        );
      }
      const json = JSON.parse(body) as {
        content?: string;
        description?: string;
        title?: string;
      };
      const text = json.content?.trim() ||
        [json.title, json.description].filter(Boolean).join("\n").trim();
      return text ? text.slice(0, maxLength) : null;
    } finally {
      requestSignal.cleanup();
    }
  }
}

export const keenableProvider = new KeenableProvider();
