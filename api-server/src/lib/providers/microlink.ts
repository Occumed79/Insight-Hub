import {
  providerBudgetAvailable,
  recordProviderFailure,
  recordProviderSuccess,
} from "../providerBudget";
import { composeAbortSignal } from "./abortSignals";

const MICROLINK_ENDPOINT = "https://api.microlink.io";
const REQUEST_TIMEOUT_MS = 20_000;

export class MicrolinkProvider {
  readonly name = "microlink" as const;

  // Microlink's free endpoint is keyless. An optional paid key can be supplied
  // later without making the free fallback depend on one.
  async isConfigured(): Promise<boolean> {
    return true;
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
      const optionalKey = process.env.MICROLINK_API_KEY?.trim();
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
