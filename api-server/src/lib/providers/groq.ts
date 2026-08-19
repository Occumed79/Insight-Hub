/**
 * Groq Provider
 *
 * Role: Ultra-fast AI inference. Groq runs open-source models at very high
 * speed — ideal for latency-sensitive opportunity extraction.
 */

import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { resolveCredential } from "../config/providerConfig";
import { OCCUMED_PROFILE, OCCUMED_DEFAULT_QUERIES } from "./gemini";
import { FreeTierCredentialPool } from "./freeTierCredentialPool";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "llama-3.1-8b-instant";
const credentials = new FreeTierCredentialPool(
  "groq-multi-account",
  [
    { dbKey: "groqApiKey", envKey: "GROQ_API_KEY" },
    { envKey: "GROQ_KEY_2" },
  ],
  { rotateOnSuccess: false },
);

export class GroqProvider implements DataSourceProvider {
  readonly name = "groq" as const;

  private async getModel(): Promise<string> {
    const model = await resolveCredential("groqModel", "GROQ_MODEL");
    return model ?? DEFAULT_MODEL;
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
      const response = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
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

      if (response.status === 429) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(
          `GROQ_RATE_LIMITED: ${body?.error?.message ?? "Rate limit reached"}`,
        );
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Groq error ${response.status}: ${body.slice(0, 200)}`);
      }

      const json = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return (json.choices?.[0]?.message?.content ?? "").trim();
    });
  }

  async generateSearchQueries(customKeywords?: string): Promise<string[]> {
    const QUERY_YEAR = new Date().getFullYear();
    const prompt = `You are a procurement intelligence specialist helping Occu-Med find government contracting opportunities.\n\nOccu-Med provides: ${OCCUMED_PROFILE.services.slice(0, 8).join("; ")}.\nThey serve: ${OCCUMED_PROFILE.clientTypes.join(", ")}.\n${customKeywords ? `User focus: ${customKeywords}` : ""}\n\nGenerate exactly 8 targeted Google search queries to find ACTIVE RFPs and solicitations for ${QUERY_YEAR}.\n\nRules:\n- Google search strings only (not URLs)\n- Include year ${QUERY_YEAR} in each query\n- Mix different Occu-Med service lines\n- Use terms: RFP, solicitation, bid, contract, procurement\n\nRespond ONLY with a JSON array: ["query1", ..., "query8"]`;

    try {
      const text = await this.complete(prompt, 600);
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      const queries = JSON.parse(cleaned);
      if (Array.isArray(queries) && queries.length > 0) return queries as string[];
    } catch {}
    return OCCUMED_DEFAULT_QUERIES;
  }

  async extractOpportunityFromWebResult(
    title: string,
    url: string,
    content: string,
  ): Promise<{
    isOpportunity: boolean;
    title?: string;
    agency?: string;
    description?: string;
    deadline?: string | null;
    estimatedValue?: number | null;
    location?: string | null;
    relevanceScore?: number;
    relevanceReason?: string;
    reason?: string;
  } | null> {
    const today = new Date().toISOString().split("T")[0];
    const prompt = `Procurement analyst for Occu-Med (occupational health services).\nToday: ${today}\n\nIs this an ACTIVE, OPEN solicitation Occu-Med could bid on?\n\nTitle: ${title}\nURL: ${url}\nContent: ${content.slice(0, 2000)}\n\nIf YES, respond with JSON only:\n{"isOpportunity":true,"title":"...","agency":"...","description":"...","deadline":"YYYY-MM-DD or null","estimatedValue":number or null,"location":"city/state or null","relevanceScore":0-100,"relevanceReason":"..."}\n\nIf NO:\n{"isOpportunity":false,"reason":"..."}`;

    try {
      const text = await this.complete(prompt, 400);
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
    const prompt = `Score relevance 0-100.\nOrg: ${orgContext}\nOpportunity: ${opportunityTitle}\nDescription: ${description.slice(0, 1500)}\n\nJSON only: {"score":<0-100>,"explanation":"1-2 sentences"}`;
    try {
      const text = await this.complete(prompt, 200);
      return JSON.parse(text.replace(/```json\n?/g, "").replace(/```/g, "").trim());
    } catch {
      return null;
    }
  }
}

export const groqProvider = new GroqProvider();
