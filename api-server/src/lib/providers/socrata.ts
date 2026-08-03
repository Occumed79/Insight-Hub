import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { resolveCredential } from "../config/providerConfig";
import { composeAbortSignal } from "./abortSignals";

const SOCRATA_DISCOVERY_URL = "https://api.us.socrata.com/api/catalog/v1";
const REQUEST_TIMEOUT_MS = 20_000;

type SocrataCredentials =
  | { mode: "app-token"; appToken: string }
  | { mode: "api-key"; key: string; secret: string };

export interface SocrataCatalogResult {
  title: string;
  description: string;
  url: string;
  domain?: string;
  assetId?: string;
  updatedAt?: string;
}

export class SocrataProvider implements DataSourceProvider {
  readonly name = "socrata" as const;

  private async credentials(): Promise<SocrataCredentials | null> {
    const [appToken, key, secret] = await Promise.all([
      resolveCredential("socrataAppToken", "SOCRATA_APP_TOKEN"),
      resolveCredential("socrataApiKey", "SOCRATA_API_KEY"),
      resolveCredential("socrataApiSecret", "SOCRATA_APP_SECRET"),
    ]);

    // Public catalogue discovery only needs the Tyler/Socrata application
    // token. Retain API-key/secret Basic authentication as a compatible
    // fallback for accounts that already use that credential pair.
    if (appToken) return { mode: "app-token", appToken };
    if (key && secret) return { mode: "api-key", key, secret };
    return null;
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.credentials());
  }

  async search(
    query: string,
    signal?: AbortSignal,
  ): Promise<SocrataCatalogResult[]> {
    const credentials = await this.credentials();
    if (!credentials) {
      throw new Error(
        "Socrata is not configured. Set SOCRATA_APP_TOKEN or the SOCRATA_API_KEY/SOCRATA_API_SECRET pair.",
      );
    }

    const url = new URL(SOCRATA_DISCOVERY_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("only", "datasets");
    url.searchParams.set("limit", "20");
    const requestSignal = composeAbortSignal(REQUEST_TIMEOUT_MS, signal);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (credentials.mode === "app-token") {
      headers["X-App-Token"] = credentials.appToken;
    } else {
      headers.Authorization = `Basic ${Buffer.from(
        `${credentials.key}:${credentials.secret}`,
      ).toString("base64")}`;
    }

    try {
      const response = await fetch(url, {
        headers,
        signal: requestSignal.signal,
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(
          `Socrata Discovery API error ${response.status}: ${body.slice(0, 200)}`,
        );
      }
      const json = JSON.parse(body) as {
        results?: Array<{
          resource?: {
            name?: string;
            description?: string;
            id?: string;
            updatedAt?: string;
          };
          metadata?: { domain?: string };
          permalink?: string;
        }>;
      };
      return (json.results ?? []).flatMap((result) => {
        const domain = result.metadata?.domain;
        const assetId = result.resource?.id;
        const resultUrl =
          result.permalink ||
          (domain && assetId ? `https://${domain}/d/${assetId}` : "");
        return resultUrl
          ? [
              {
                title: result.resource?.name ?? resultUrl,
                description: result.resource?.description ?? "",
                url: resultUrl,
                domain,
                assetId,
                updatedAt: result.resource?.updatedAt,
              },
            ]
          : [];
      });
    } finally {
      requestSignal.cleanup();
    }
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const query =
      options.keywords?.trim() ||
      "procurement bids solicitations contracts occupational health";
    const results = await this.search(query, options.signal);
    const records = results.map((result) => ({
      id: `socrata-${result.domain ?? "dataset"}-${result.assetId ?? Buffer.from(result.url).toString("base64").slice(0, 12)}`,
      title: result.title,
      description: result.description,
      url: result.url,
      source: this.name,
      providerName: "Tyler Data & Insights / Socrata",
      status: "active" as const,
      relevanceScore: 45,
      rawData: { query, result, officialOpenData: true },
    }));
    return { records: records as any, total: records.length, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }
}

export const socrataProvider = new SocrataProvider();
