import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import type { ProviderName } from "../config/providerConfig";
import { resolveCredential } from "../config/providerConfig";

export interface OpenAiCompatibleProviderOptions {
  name: ProviderName;
  dbKey: string;
  envKey: string;
  baseUrl: string;
  defaultModel: string;
  displayName: string;
  extraHeaders?: Record<string, string>;
}

/**
 * Generic OpenAI-compatible chat-completion provider.
 *
 * Several Render keys added for Insight Hub expose OpenAI-style
 * /chat/completions endpoints. This class keeps those providers lightweight and
 * available for extraction/ranking failover without copy-pasting request code.
 */
export class OpenAiCompatibleProvider implements DataSourceProvider {
  readonly name: ProviderName;
  private readonly dbKey: string;
  private readonly envKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly displayName: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.name = options.name;
    this.dbKey = options.dbKey;
    this.envKey = options.envKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.defaultModel = options.defaultModel;
    this.displayName = options.displayName;
    this.extraHeaders = options.extraHeaders ?? {};
  }

  private async getApiKey(): Promise<string | null> {
    return resolveCredential(this.dbKey, this.envKey);
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    // AI providers are utility providers for generation/extraction, not direct
    // opportunity feeds.
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }

  async complete(prompt: string, maxTokens = 512, model = this.defaultModel): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error(`${this.displayName} API key not configured.`);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...this.extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    });

    if (response.status === 429) {
      const body = await response.text().catch(() => "");
      throw new Error(`${this.name.toUpperCase()}_RATE_LIMITED: ${body.slice(0, 200) || "Rate limit reached"}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`${this.displayName} error ${response.status}: ${body.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    return (json.choices?.[0]?.message?.content ?? "").trim();
  }
}

export const cerebrasProvider = new OpenAiCompatibleProvider({
  name: "cerebras",
  dbKey: "cerebrasApiKey",
  envKey: "CEREBRAS_API_KEY",
  displayName: "Cerebras",
  baseUrl: "https://api.cerebras.ai/v1",
  defaultModel: "llama3.1-8b",
});

export const deepseekProvider = new OpenAiCompatibleProvider({
  name: "deepseek",
  dbKey: "deepseekApiKey",
  envKey: "DEEPSEEK_API_KEY",
  displayName: "DeepSeek",
  baseUrl: "https://api.deepseek.com/v1",
  defaultModel: "deepseek-chat",
});

export const mistralProvider = new OpenAiCompatibleProvider({
  name: "mistral",
  dbKey: "mistralApiKey",
  envKey: "MISTRAL_API_KEY",
  displayName: "Mistral",
  baseUrl: "https://api.mistral.ai/v1",
  defaultModel: "mistral-small-latest",
});

export const nvidiaProvider = new OpenAiCompatibleProvider({
  name: "nvidia",
  dbKey: "nvidiaApiKey",
  envKey: "NVIDIA_API_KEY",
  displayName: "NVIDIA NIM",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  defaultModel: "meta/llama-3.1-8b-instruct",
});