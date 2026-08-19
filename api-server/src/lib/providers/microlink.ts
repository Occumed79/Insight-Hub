import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import {
  providerBudgetAvailable,
  recordProviderFailure,
  recordProviderSuccess,
} from "../providerBudget";
import { resolveCredential } from "../config/providerConfig";
import { composeAbortSignal } from "./abortSignals";

const MICROLINK_ENDPOINT = "https://api.microlink.io";
const REQUEST_TIMEOUT_MS = 20_000;

export class MicrolinkProvider implements DataSourceProvider {
  readonly name = "microlink" as const;

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    // Microlink is enrichment-only and must never become a discovery feed.
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: true,
      healthy: await providerBudgetAvailable("microlink"),
    };
  }

  async usageMode(): Promise<"keyed" | "keyless"> {
    return (await resolveCredential("microlinkApiKey", "MICROLINK_API_KEY"))
      ? "keyed"
      : "keyless";
  }

  async fetchText(
    url: string,
    maxLength = 8_000,
    signal?: AbortSignal,
  ): Promise<string | null> {
    if (!(await providerBudgetAvailable("microlink"))) return null;

    const endpoint = new URL(MICROLINK_ENDPOINT);
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("data.content.selector", "body");
    endpoint.searchParams.set("data.content.type", "text");
    endpoint.searchParams.set("filter", "content,title,description,url");
    const requestSignal = composeAbortSignal(REQUEST_TIMEOUT_MS, signal);

    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      const optionalKey = await resolveCredential(
        "microlinkApiKey",
        "MICROLINK_API_KEY",
      );
      if (optionalKey) headers["x-api-key"] = optionalKey;

      const response = await fetch(endpoint, {
        headers,
        signal: requestSignal.signal,
      });
      const body = await response.text();
      if (!response.ok) {
        const error = new Error(
          `Microlink error ${response.status}: ${body.slice(0, 200)}`,
        );
        await recordProviderFailure("microlink", error);
        throw error;
      }
      const json = JSON.parse(body) as {
        status?: string;
        data?: {
          content?: string;
          title?: string;
          description?: string;
        };
      };
      const text =
        json.data?.content?.trim() ||
        [json.data?.title, json.data?.description]
          .filter(Boolean)
          .join("\n")
          .trim();
      await recordProviderSuccess("microlink", text ? 1 : 0);
      return text ? text.slice(0, maxLength) : null;
    } catch (error) {
      if (!/Microlink error/i.test(error instanceof Error ? error.message : "")) {
        await recordProviderFailure("microlink", error).catch(() => undefined);
      }
      return null;
    } finally {
      requestSignal.cleanup();
    }
  }
}

export const microlinkProvider = new MicrolinkProvider();
