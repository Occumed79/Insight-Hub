/**
 * Local LLM Provider (Ollama/LocalAI)
 *
 * Role: Provide AI extraction and scoring capabilities using locally-hosted LLMs
 * instead of external API services. This eliminates API key dependencies and
 * rate limits while maintaining AI capabilities.
 *
 * Benefits:
 * - No API keys required
 * - No rate limits
 * - Full control over models
 * - Works offline
 * - Privacy (data stays local)
 * - Cost-effective (no per-token costs)
 *
 * Supports:
 * - Ollama (https://ollama.ai)
 * - LocalAI (https://localai.io)
 * - Any OpenAI-compatible local server
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const DEFAULT_MODEL = "llama3.2";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 1024;

export interface LocalLlmOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface LocalLlmCompletion {
  text: string;
  model: string;
  tokensUsed?: number;
}

export class LocalLlmProvider implements DataSourceProvider {
  readonly name = "localLlm" as const;

  private async getEndpoint(): Promise<string | null> {
    return resolveCredential("localLlmEndpoint", "LOCAL_LLM_ENDPOINT");
  }

  private async getModel(): Promise<string> {
    const model = await resolveCredential("localLlmModel", "LOCAL_LLM_MODEL");
    return model ?? DEFAULT_MODEL;
  }

  async isConfigured(): Promise<boolean> {
    const endpoint = await this.getEndpoint();
    return !!endpoint;
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    let healthy = configured;
    
    if (configured) {
      try {
        const endpoint = await this.getEndpoint();
        const response = await fetch(`${endpoint}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        healthy = response.ok;
      } catch {
        healthy = false;
      }
    }
    
    return { name: this.name, configured, healthy };
  }

  /**
   * Generate text completion using local LLM.
   */
  async complete(
    prompt: string,
    options: LocalLlmOptions = {}
  ): Promise<string> {
    const endpoint = await this.getEndpoint();
    if (!endpoint) throw new Error("Local LLM endpoint not configured");

    const model = options.model ?? (await this.getModel());
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Local LLM error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const json = await response.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens: number };
    };

    const content = json.choices?.[0]?.message?.content ?? "";
    return content.trim();
  }

  /**
   * Extract structured opportunity data from web content.
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
      const text = await this.complete(prompt, { maxTokens: 512 });
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
      const text = await this.complete(prompt, { maxTokens: 256 });
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  /**
   * Generate targeted search queries for opportunity discovery.
   */
  async generateSearchQueries(customKeywords?: string): Promise<string[]> {
    const QUERY_YEAR = new Date().getFullYear();

    const OCCUMED_PROFILE = {
      services: [
        "Occupational health services",
        "Pre-employment physicals",
        "Drug and alcohol testing",
        "DOT physicals",
        "Respirator fit testing",
        "Audiometric testing",
        "Spirometry",
        "Medical surveillance",
        "Employee health screenings",
      ],
      clientTypes: [
        "Government agencies",
        "School districts",
        "Universities",
        "Manufacturing companies",
        "Transportation companies",
        "Utility companies",
        "Construction companies",
      ],
    };

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
      const text = await this.complete(prompt, { maxTokens: 600 });
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      const queries = JSON.parse(cleaned);
      if (Array.isArray(queries) && queries.length > 0) return queries as string[];
    } catch {
      // Fall through to defaults
    }

    // Default queries if AI fails
    return [
      `("occupational health services" OR "employee health services") (RFP OR RFQ OR solicitation) (state OR city OR county OR "school district" OR university) ${QUERY_YEAR} -awarded -jobs`,
      `("medical surveillance" OR "pre-employment physicals") (RFP OR bid OR solicitation) (state OR local OR municipal OR university) ${QUERY_YEAR} -awarded -jobs`,
      `("drug and alcohol testing" OR "DOT physical") (RFP OR RFQ OR "request for proposal") (city OR county OR transit OR utility) ${QUERY_YEAR} -awarded -jobs`,
      `("respirator fit testing" OR audiometric OR spirometry) (RFP OR solicitation OR bid) (government OR university OR hospital) ${QUERY_YEAR} -awarded -jobs`,
      `("request for proposal" OR RFP) ("occupational health" OR "employee medical services") (supplier OR vendor OR subcontractor) ${QUERY_YEAR} -awarded -jobs`,
      `("occupational medical services" OR "medical screening services") (RFP OR RFQ OR "supplier opportunity") (defense OR aerospace OR logistics OR manufacturing) ${QUERY_YEAR} -awarded -jobs`,
      `("drug testing services" OR "fitness for duty") (RFP OR "vendor opportunity" OR procurement) (transportation OR utility OR construction OR industrial) ${QUERY_YEAR} -awarded -jobs`,
      `("clinic network" OR "nationwide occupational health") (RFP OR "request for proposal" OR subcontract) ${QUERY_YEAR} -awarded -jobs`,
    ];
  }
}

export const localLlmProvider = new LocalLlmProvider();
