/**
 * Groq Provider
 *
 * Role: Ultra-fast AI inference. Groq runs open-source models (Llama 3, Mixtral,
 * Gemma) at very high speed — ideal for latency-sensitive tasks like per-result
 * extraction during opportunity discovery pipelines.
 *
 * API docs: https://console.groq.com/docs/openai
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";
import { OCCUMED_PROFILE, OCCUMED_DEFAULT_QUERIES } from "./gemini";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "llama-3.1-8b-instant";

export class GroqProvider implements DataSourceProvider {
  readonly name = "groq" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("groqApiKey", "GROQ_API_KEY");
  }

  private async getModel(): Promise<string> {
    const model = await resolveCredential("groqModel", "GROQ_MODEL");
    return model ?? DEFAULT_MODEL;
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }

  /**
   * Send a chat completion request to Groq.
   */
  async complete(prompt: string, maxTokens = 512): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("Groq API key not configured.");

    const model = await this.getModel();

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
    });

    if (response.status === 429) {
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`GROQ_RATE_LIMITED: ${body?.error?.message ?? "Rate limit reached"}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Groq error ${response.status}: ${body.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    return (json.choices?.[0]?.message?.content ?? "").trim();
  }

  /**
   * Generate targeted search queries for Occu-Med opportunity discovery.
   * Groq's speed makes it well-suited for this batch generation step.
   * Falls back to OCCUMED_DEFAULT_QUERIES if the call fails.
   */
  async generateSearchQueries(customKeywords?: string): Promise<string[]> {
    const QUERY_YEAR = new Date().getFullYear();

    const prompt = `You are a procurement intelligence specialist helping Occu-Med find government contracting opportunities.

Occu-Med provides: ${OCCUMED_PROFILE.services.slice(0, 8).join("; ")}.
They serve: ${OCCUMED_PROFILE.clientTypes.join(", ")}.
${customKeywords ? `User focus: ${customKeywords}` : ""}

Generate exactly 8 targeted Google search queries to find ACTIVE RFPs and solicitations for ${QUERY_YEAR}.

Rules:
- Google search strings only (not URLs)
- Include year ${QUERY_YEAR} in each query
- Mix different Occu-Med service lines
- Use terms: RFP, solicitation, bid, contract, procurement

Respond ONLY with a JSON array: ["query1", ..., "query8"]`;

    try {
      const text = await this.complete(prompt, 600);
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      const queries = JSON.parse(cleaned);
      if (Array.isArray(queries) && queries.length > 0) return queries as string[];
    } catch {
      // fall through to defaults
    }

    return OCCUMED_DEFAULT_QUERIES;
  }

  /**
   * Quickly analyze a web result and extract structured opportunity data.
   * Groq's low latency is ideal for per-URL extraction in bulk pipelines.
   */
  async extractOpportunityFromWebResult(
    title: string,
    url: string,
    content: string
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

    const prompt = `Procurement analyst for Occu-Med (occupational health services).
Today: ${today}

Is this an ACTIVE, OPEN solicitation Occu-Med could bid on?

Title: ${title}
URL: ${url}
Content: ${content.slice(0, 2000)}

If YES, respond with JSON only:
{"isOpportunity":true,"title":"...","agency":"...","description":"...","deadline":"YYYY-MM-DD or null","estimatedValue":number or null,"location":"city/state or null","relevanceScore":0-100,"relevanceReason":"..."}

If NO:
{"isOpportunity":false,"reason":"..."}`;

    try {
      const text = await this.complete(prompt, 400);
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  /**
   * Score opportunity relevance to Occu-Med (0-100).
   */
  async scoreRelevance(
    opportunityTitle: string,
    description: string,
    orgContext: string
  ): Promise<{ score: number; explanation: string } | null> {
    const prompt = `Score relevance 0-100.
Org: ${orgContext}
Opportunity: ${opportunityTitle}
Description: ${description.slice(0, 1500)}

JSON only: {"score":<0-100>,"explanation":"1-2 sentences"}`;

    try {
      const text = await this.complete(prompt, 200);
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

export const groqProvider = new GroqProvider();
