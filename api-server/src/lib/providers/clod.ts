/**
 * CLōD Provider
 *
 * Role: OpenAI-compatible AI endpoint at api.clod.io. Used as an alternative
 * AI backend for query generation, opportunity extraction, and relevance scoring.
 * Drop-in replacement for OpenRouter/Groq with your own CLōD project.
 *
 * API: https://api.clod.io/v1 (OpenAI-compatible)
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";
import { OCCUMED_PROFILE, OCCUMED_DEFAULT_QUERIES } from "./gemini";

const CLOD_BASE = "https://api.clod.io/v1";
const DEFAULT_MODEL = "claude-sonnet-4-5";

export class ClodProvider implements DataSourceProvider {
  readonly name = "clod" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("clodApiKey", "CLOD_API_KEY");
  }

  private async getModel(): Promise<string> {
    const model = await resolveCredential("clodModel", "CLOD_MODEL");
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
   * Send a chat completion to the CLōD endpoint.
   */
  async complete(prompt: string, maxTokens = 512): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("CLōD API key not configured.");

    const model = await this.getModel();

    const response = await fetch(`${CLOD_BASE}/chat/completions`, {
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

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`CLōD error ${response.status}: ${body.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    return (json.choices?.[0]?.message?.content ?? "").trim();
  }

  /**
   * Generate targeted search queries for Occu-Med opportunity discovery.
   */
  async generateSearchQueries(customKeywords?: string): Promise<string[]> {
    const QUERY_YEAR = new Date().getFullYear();

    const prompt = `You are a procurement intelligence specialist helping Occu-Med find government contracting opportunities.

Occu-Med provides: ${OCCUMED_PROFILE.services.slice(0, 8).join("; ")}.
They serve: ${OCCUMED_PROFILE.clientTypes.join(", ")}.
${customKeywords ? `User focus: ${customKeywords}` : ""}

Generate exactly 8 highly targeted Google search queries to find ACTIVE RFPs and solicitations for ${QUERY_YEAR}.

Rules:
- Google search strings only (not URLs)
- Include year ${QUERY_YEAR} in each query
- Mix different Occu-Med service lines
- Use terms: RFP, solicitation, bid, contract, procurement

Respond ONLY with a JSON array of 8 strings: ["query1", ..., "query8"]`;

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
   * Analyze a web result and extract structured opportunity data.
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

    const prompt = `You are a procurement intelligence analyst for Occu-Med (occupational health services).
Today: ${today}

Is this an ACTIVE, OPEN solicitation Occu-Med could bid on?

Title: ${title}
URL: ${url}
Content: ${content.slice(0, 2500)}

If YES, respond with JSON only (no markdown):
{"isOpportunity":true,"title":"...","agency":"...","description":"...","deadline":"YYYY-MM-DD or null","estimatedValue":number or null,"location":"city/state or null","relevanceScore":0-100,"relevanceReason":"..."}

If NO:
{"isOpportunity":false,"reason":"..."}`;

    try {
      const text = await this.complete(prompt, 512);
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  /**
   * Score relevance of an opportunity to Occu-Med (0-100).
   */
  async scoreRelevance(
    opportunityTitle: string,
    description: string,
    orgContext: string
  ): Promise<{ score: number; explanation: string } | null> {
    const prompt = `Score relevance 0-100.
Organization: ${orgContext}
Opportunity: ${opportunityTitle}
Description: ${description.slice(0, 2000)}

JSON only: {"score": <0-100>, "explanation": "1-2 sentences"}`;

    try {
      const text = await this.complete(prompt, 256);
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

export const clodProvider = new ClodProvider();
