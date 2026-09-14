import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { resolveCredential } from "../config/providerConfig";
import {
  searchSocrataCatalog,
  type SocrataCatalogResult,
} from "./socrataCatalog";

export type SocrataCredentials =
  | { mode: "app-token"; appToken: string }
  | { mode: "api-key"; key: string; secret: string };

/**
 * Socrata used SOCRATA_APP_SECRET in older deployments and now uses the
 * canonical SOCRATA_API_SECRET name. Both environment aliases must outrank a
 * database fallback so a stale settings row can never shadow a Render secret.
 */
export function selectSocrataApiSecret(
  canonicalEnvironmentSecret?: string,
  legacyEnvironmentSecret?: string,
  databaseSecret?: string | null,
): string | null {
  for (const candidate of [
    canonicalEnvironmentSecret,
    legacyEnvironmentSecret,
    databaseSecret,
  ]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function socrataHeaders(
  credentials: SocrataCredentials,
): Record<string, string> {
  if (credentials.mode === "app-token") {
    return { "X-App-Token": credentials.appToken };
  }
  return {
    Authorization: `Basic ${Buffer.from(
      `${credentials.key}:${credentials.secret}`,
    ).toString("base64")}`,
  };
}

export function isSocrataStructuredEnabled(): boolean {
  return /^(?:1|true|yes|on)$/i.test(
    process.env.SOCRATA_STRUCTURED_ENABLED?.trim() ?? "",
  );
}

export class SocrataProvider implements DataSourceProvider {
  readonly name = "socrata" as const;

  private async credentials(): Promise<SocrataCredentials | null> {
    const [appToken, key, databaseSecret] = await Promise.all([
      resolveCredential("socrataAppToken", "SOCRATA_APP_TOKEN"),
      resolveCredential("socrataApiKey", "SOCRATA_API_KEY"),
      // Environment aliases are handled explicitly below so both aliases keep
      // environment-first precedence ahead of this single DB fallback.
      resolveCredential("socrataApiSecret"),
    ]);
    const secret = selectSocrataApiSecret(
      process.env.SOCRATA_API_SECRET,
      process.env.SOCRATA_APP_SECRET,
      databaseSecret,
    );

    // Public reads prefer the Tyler/Socrata application token. Retain the
    // API-key/secret Basic-auth path for compatibility with existing accounts.
    if (appToken) return { mode: "app-token", appToken };
    if (key && secret) return { mode: "api-key", key, secret };
    return null;
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.credentials());
  }

  /**
   * Catalogue discovery is intentionally retained as a registry/scout
   * primitive. A catalogue result is metadata about a dataset, never an RFP.
   */
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
    return searchSocrataCatalog(query, socrataHeaders(credentials), signal);
  }

  /**
   * The opportunity provider must never map catalogue assets into procurement
   * records. Structured SODA3 row ingestion is feature-gated until its row
   * adapters, schema guards, and precision fixtures are complete.
   */
  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    if (!isSocrataStructuredEnabled()) {
      return {
        records: [],
        total: 0,
        errors: [],
        diagnostics: {
          structuredEnabled: false,
          catalogAssetsEmitted: 0,
        },
      };
    }

    return {
      records: [],
      total: 0,
      errors: [
        "Socrata structured ingestion is enabled but no row adapter has been activated yet.",
      ],
      diagnostics: {
        structuredEnabled: true,
        catalogAssetsEmitted: 0,
      },
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }
}

export const socrataProvider = new SocrataProvider();
