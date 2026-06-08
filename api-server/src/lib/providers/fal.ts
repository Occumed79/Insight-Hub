import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

export interface FalRunRequest {
  model: string;
  input: Record<string, unknown>;
}

export interface FalRunResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Fal is not a procurement feed. It is wired as a bounded model utility for
 * future media/document workflows that need Fal-hosted models.
 */
export class FalProvider implements DataSourceProvider {
  readonly name = "fal" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("falApiKey", "FAL_API_KEY");
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    // Fal is intentionally not treated as an opportunity source.
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }

  async runModel(request: FalRunRequest): Promise<FalRunResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return { ok: false, error: "FAL_API_KEY is not configured." };
    if (!request.model || !request.input) return { ok: false, error: "Fal model and input are required." };

    try {
      const response = await fetch(`https://fal.run/${request.model.replace(/^\/+/, "")}`, {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request.input),
        signal: AbortSignal.timeout(60000),
      });

      const text = await response.text().catch(() => "");
      const data = parseMaybeJson(text);
      if (!response.ok) {
        return { ok: false, error: `Fal error ${response.status}: ${text.slice(0, 300)}` };
      }

      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const falProvider = new FalProvider();