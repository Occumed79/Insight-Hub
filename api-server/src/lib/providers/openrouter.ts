/**
 * OpenRouter Provider
 *
 * Role: Alternative AI backend with access to 100+ models (Claude, GPT-4, Mistral,
 * Llama, Gemma, etc.) via a single OpenAI-compatible API. Used as a flexible
 * replacement or complement to Gemini for query generation, extraction, and scoring.
 *
 * API docs: https://openrouter.ai/docs
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";
import { OCCUMED_PROFILE, OCCUMED_DEFAULT_QUERIES } from "./gemini";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";

export class OpenRouterProvider implements DataSourceProvider {
  readonly name = "openrouter" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("openrouterApiKey", "OPENROUTER_API_KEY");
  }

  private async getModel(): Promise<string> {
    const model = await resolveCredential("openrouterModel", "OPENROUTER_MODEL");
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
   * Send a chat completion request to OpenRouter.
   */
  async complete(prompt: string, maxTokens = 512): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("OpenRouter API key not configured.");

    const model = await this.getModel();

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
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenRouter error ${response.status}: ${body.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    return (json.choices?.[0]?.message?.content ?? "").trim();
  }

  /**
   * Generate targeted search queries for Occu-Med opportunity discovery.
   * Falls back to OCCUMED_DEFAULT_QUERIES if the call fails.
   */
  async generateSearchQueries(customKeywords?: string): Promise<string[]> {
    const QUERY_YEAR = new Date().getFullYear();

    const prompt = `You are a procurement intelligence specialist helping Occu-Med find relevant government contracting opportunities.

Occu-Med provides: ${OCCUMED_PROFILE.services.slice(0, 8).join("; ")}.
They serve: ${OCCUMED_PROFILE.clientTypes.join(", ")}.
${customKeywords ? `User-specified focus: ${customKeywords}` : ""}

Generate exactly 8 highly targeted Google search queries to find ACTIVE RFPs, solicitations, and procurement opportunities that Occu-Med could bid on.

Rules:
- Each query must be a Google search string
- Target OPEN/ACTIVE opportunities only — include year ${QUERY_YEAR} in each query
- Mix different Occu-Med service lines across the 8 queries
- Use procurement terms: RFP, "request for proposal", solicitation, bid, contract, procurement

Respond ONLY with a JSON array of 8 query strings:
["query1", "query2", ..., "query8"]`;

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
   * Analyze a web result and extract opportunity data.
   * Returns null if the call fails.
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

    const prompt = `You are a procurement intelligence analyst for Occu-Med, an occupational health services company.

Occu-Med's services: ${OCCUMED_PROFILE.services.slice(0, 7).join("; ")}.
Today's date: ${today}

Analyze this web result and determine if it is an ACTIVE, OPEN solicitation or RFP that Occu-Med could bid on.

Title: ${title}
URL: ${url}
Content: ${content.slice(0, 2500)}

If this IS an active open opportunity respond ONLY with JSON (no markdown):
{
  "isOpportunity": true,
  "title": "clean opportunity title",
  "agency": "procuring organization",
  "description": "what is being procured (2-3 sentences)",
  "deadline": "YYYY-MM-DD or null",
  "estimatedValue": number or null,
  "location": "city/state or null",
  "relevanceScore": 0-100,
  "relevanceReason": "one sentence"
}

If NOT a valid opportunity respond ONLY with:
{"isOpportunity": false, "reason": "brief reason"}`;

    try {
      const text = await this.complete(prompt, 512);
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  /**
   * Score an opportunity's relevance to Occu-Med (0-100).
   */
  async scoreRelevance(
    opportunityTitle: string,
    description: string,
    orgContext: string
  ): Promise<{ score: number; explanation: string } | null> {
    const prompt = `Score the relevance of this opportunity to the organization.

Organization: ${orgContext}
Opportunity: ${opportunityTitle}
Description: ${description.slice(0, 2000)}

Respond ONLY with JSON: {"score": <0-100>, "explanation": "1-2 sentences"}`;

    try {
      const text = await this.complete(prompt, 256);
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

export const openrouterProvider = new OpenRouterProvider();
