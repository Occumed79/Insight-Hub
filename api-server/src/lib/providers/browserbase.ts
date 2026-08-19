import { FreeTierCredentialPool } from "./freeTierCredentialPool";
import { composeAbortSignal } from "./abortSignals";

const BROWSERBASE_BASE = "https://api.browserbase.com/v1";
const REQUEST_TIMEOUT_MS = 25_000;

const credentials = new FreeTierCredentialPool(
  "browserbase-multi-account",
  [
    { envKey: "BROWSERBASE_API_KEY" },
    { envKey: "BROWSERBASE_KEY_2" },
  ],
  { rotateOnSuccess: false },
);

export interface BrowserbaseSearchResult {
  id?: string;
  url: string;
  title: string;
  author?: string;
  publishedDate?: string;
}

export class BrowserbaseProvider {
  readonly name = "browserbase" as const;

  async isConfigured(): Promise<boolean> {
    return credentials.isConfigured();
  }

  async search(
    query: string,
    limit = 15,
    signal?: AbortSignal,
  ): Promise<BrowserbaseSearchResult[]> {
    return credentials.run(async (apiKey) => {
      const requestSignal = composeAbortSignal(REQUEST_TIMEOUT_MS, signal);
      try {
        const response = await fetch(`${BROWSERBASE_BASE}/search`, {
          method: "POST",
          headers: {
            "X-BB-API-Key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: query.slice(0, 200),
            numResults: Math.max(1, Math.min(25, limit)),
          }),
          signal: requestSignal.signal,
        });
        const body = await response.text();
        if (!response.ok) {
          throw new Error(
            `Browserbase search error ${response.status}: ${body.slice(0, 200)}`,
          );
        }
        const json = JSON.parse(body) as {
          results?: Array<{
            id?: string;
            url?: string;
            title?: string;
            author?: string;
            publishedDate?: string;
          }>;
        };
        return (json.results ?? []).flatMap((result) =>
          result.url
            ? [{
                id: result.id,
                url: result.url,
                title: result.title ?? result.url,
                author: result.author,
                publishedDate: result.publishedDate,
              }]
            : [],
        );
      } finally {
        requestSignal.cleanup();
      }
    });
  }

  async fetchText(
    url: string,
    maxLength = 8_000,
    signal?: AbortSignal,
  ): Promise<string | null> {
    return credentials.run(async (apiKey) => {
      const requestSignal = composeAbortSignal(REQUEST_TIMEOUT_MS, signal);
      try {
        const response = await fetch(`${BROWSERBASE_BASE}/fetch`, {
          method: "POST",
          headers: {
            "X-BB-API-Key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            allowRedirects: true,
            allowInsecureSsl: false,
            proxies: false,
          }),
          signal: requestSignal.signal,
        });
        const body = await response.text();
        if (!response.ok) {
          throw new Error(
            `Browserbase fetch error ${response.status}: ${body.slice(0, 200)}`,
          );
        }
        const json = JSON.parse(body) as {
          statusCode?: number;
          content?: string;
        };
        if (
          typeof json.statusCode === "number" &&
          (json.statusCode < 200 || json.statusCode >= 400)
        ) {
          throw new Error(`Browserbase fetched upstream HTTP ${json.statusCode}`);
        }
        const content = json.content?.trim();
        return content ? content.slice(0, maxLength) : null;
      } finally {
        requestSignal.cleanup();
      }
    });
  }
}

export const browserbaseProvider = new BrowserbaseProvider();
