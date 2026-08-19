/** OpenRouter AI provider used as a bounded extraction/scoring fallback. */
import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { resolveCredential } from "../config/providerConfig";
import { OCCUMED_PROFILE, OCCUMED_DEFAULT_QUERIES } from "./gemini";
import { FreeTierCredentialPool } from "./freeTierCredentialPool";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";
const credentials = new FreeTierCredentialPool(
  "openrouter-multi-account",
  [
    { dbKey: "openrouterApiKey", envKey: "OPENROUTER_API_KEY" },
    { envKey: "OPENROUTER_KEY_2" },
  ],
  { rotateOnSuccess: false },
);

export class OpenRouterProvider implements DataSourceProvider {
  readonly name = "openrouter" as const;

  private async getModel(): Promise<string> {
    return (await resolveCredential("openrouterModel", "OPENROUTER_MODEL")) ?? DEFAULT_MODEL;
  }

  async isConfigured(): Promise<boolean> {
    return credentials.isConfigured();
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }

  async complete(
    prompt: string,
    maxTokens = 512,
    signal?: AbortSignal,
  ): Promise<string> {
    const model = await this.getModel();
    return credentials.run(async (apiKey) => {
      const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://occu-med.com",
          "X-Title": "Occu-Med Insight Hub",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.2,
        }),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
          : AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`OpenRouter error ${response.status}: ${body.slice(0, 200)}`);
      }
      const json = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return (json.choices?.[0]?.message?.content ?? "").trim();
    });
  }

  async generateSearchQueries(customKeywords?: string): Promise<string[]> {
    const year = new Date().getFullYear();
    const prompt = `You are a procurement intelligence specialist helping Occu-Med find relevant government contracting opportunities.\nOccu-Med provides: ${OCCUMED_PROFILE.services.slice(0, 8).join("; ")}.\nThey serve: ${OCCUMED_PROFILE.clientTypes.join(", ")}.\n${customKeywords ? `User-specified focus: ${customKeywords}` : ""}\nGenerate exactly 8 highly targeted search queries to find ACTIVE RFPs and solicitations for ${year}. Respond ONLY with a JSON array.`;
    try {
      const text = await this.complete(prompt, 600);
      const queries = JSON.parse(text.replace(/```json\n?/g, "").replace(/```/g, "").trim());
      if (Array.isArray(queries) && queries.length > 0) return queries as string[];
    } catch {}
    return OCCUMED_DEFAULT_QUERIES;
  }

  async extractOpportunityFromWebResult(
    title: string,
    url: string,
    content: string,
  ): Promise<any | null> {
    const today = new Date().toISOString().split("T")[0];
    const prompt = `You are a procurement intelligence analyst for Occu-Med. Today: ${today}. Analyze whether this is an ACTIVE, OPEN solicitation relevant to occupational health. Title: ${title}\nURL: ${url}\nContent: ${content.slice(0, 2500)}\nReturn JSON only with isOpportunity, title, agency, description, deadline, estimatedValue, location, relevanceScore, relevanceReason, or reason.`;
    try {
      const text = await this.complete(prompt, 512);
      return JSON.parse(text.replace(/```json\n?/g, "").replace(/```/g, "").trim());
    } catch {
      return null;
    }
  }

  async scoreRelevance(
    opportunityTitle: string,
    description: string,
    orgContext: string,
  ): Promise<{ score: number; explanation: string } | null> {
    const prompt = `Score the relevance of this opportunity 0-100. Organization: ${orgContext}\nOpportunity: ${opportunityTitle}\nDescription: ${description.slice(0, 2000)}\nRespond ONLY with JSON: {"score":0,"explanation":"..."}`;
    try {
      const text = await this.complete(prompt, 256);
      return JSON.parse(text.replace(/```json\n?/g, "").replace(/```/g, "").trim());
    } catch {
      return null;
    }
  }
}

export const openrouterProvider = new OpenRouterProvider();
