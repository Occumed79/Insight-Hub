/**
 * Gemini AI Provider
 *
 * Roles:
 * 1. Generate targeted search queries for Occu-Med opportunity discovery
 * 2. Extract structured opportunity data from raw web search results
 * 3. Score relevance of opportunities to Occu-Med's service lines
 * 4. Summarize and tag opportunities for BD use
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export const OCCUMED_PROFILE = {
  company: "Occu-Med",
  website: "https://www.occu-med.com",
  services: [
    "Occupational health and medicine services",
    "Pre-employment physical examinations and health screenings",
    "DOT (Department of Transportation) physical examinations and compliance",
    "Drug and alcohol testing (DOT and non-DOT)",
    "Occupational injury care and treatment",
    "Workers' compensation case management and medical management",
    "Fit-for-duty evaluations",
    "Hearing conservation and audiometric testing programs",
    "Vision testing and screenings",
    "Respirator fit testing and respiratory protection programs",
    "Return-to-work programs",
    "Employee health and wellness programs",
    "OSHA compliance programs and health surveillance",
    "Medical surveillance programs",
    "Onsite medical staffing and clinic management",
  ],
  clientTypes: [
    "Employers and HR departments",
    "Industrial and manufacturing facilities",
    "Construction companies",
    "Transportation companies (DOT-regulated carriers)",
    "Healthcare organizations",
    "Federal and state government agencies",
    "Federal contractors and subcontractors",
    "School districts and municipalities",
    "Utilities and energy companies",
  ],
  naicsCodes: ["621111", "621999", "621512", "621310"],
  keywords: [
    "occupational health", "occupational medicine", "employee health",
    "pre-employment physical", "pre-employment screening", "drug testing",
    "drug screening", "DOT physical", "DOT compliance", "medical examiner",
    "workers compensation", "fit for duty", "hearing conservation",
    "audiometric testing", "respirator fit test", "workplace health",
    "occupational injury", "return to work", "employee wellness",
    "onsite medical", "employer health services", "medical surveillance",
    "OSHA compliance", "health surveillance",
  ],
};

// Fallback queries used when Gemini is not available to generate custom ones
const QUERY_YEAR = new Date().getFullYear();

export const OCCUMED_DEFAULT_QUERIES = [
  `"occupational health services" RFP OR solicitation open ${QUERY_YEAR}`,
  `"employee health services" OR "occupational medicine" government contract ${QUERY_YEAR} due`,
  `"pre-employment physical" OR "pre-employment screening" RFP government active ${QUERY_YEAR}`,
  `"drug testing services" OR "drug screening" government contract solicitation ${QUERY_YEAR}`,
  `"DOT physical" OR "DOT compliance" services contract solicitation open ${QUERY_YEAR}`,
  `"workers compensation" "occupational health" RFP bid procurement ${QUERY_YEAR}`,
  `"hearing conservation" OR "audiometric testing" OR "respirator fit" services RFP ${QUERY_YEAR}`,
  `"workplace health" OR "employee wellness" government contract open ${QUERY_YEAR}`,
];

async function callGemini(apiKey: string, prompt: string, maxTokens = 512): Promise<string> {
  const response = await fetch(`${GEMINI_BASE}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
    }),
  });

  if (response.status === 429) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`GEMINI_QUOTA_EXCEEDED: ${body?.error?.message ?? "Rate limit reached"}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
}

export class GeminiProvider implements DataSourceProvider {
  readonly name = "gemini" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("geminiApiKey", "GEMINI_API_KEY");
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
   * Use Gemini to generate targeted search queries for Occu-Med opportunity discovery.
   * Falls back to OCCUMED_DEFAULT_QUERIES if Gemini is unavailable.
   */
  async generateSearchQueries(customKeywords?: string): Promise<string[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return OCCUMED_DEFAULT_QUERIES;

    const prompt = `You are a procurement intelligence specialist helping Occu-Med find relevant government contracting opportunities.

Occu-Med provides: ${OCCUMED_PROFILE.services.slice(0, 8).join("; ")}.
They serve: ${OCCUMED_PROFILE.clientTypes.join(", ")}.
${customKeywords ? `User-specified focus: ${customKeywords}` : ""}

Generate exactly 8 highly targeted Google search queries to find ACTIVE RFPs, solicitations, and procurement opportunities that Occu-Med could bid on.
Focus on government contracts (federal, state, local) and include both well-known occupational health terms and adjacent procurement categories.

Rules:
- Each query must be a Google search string (not a URL)
- Include year ${QUERY_YEAR} in every query
- Append -awarded -"contract award" -"award notice" to EVERY query to exclude closed bids
- Target procurement portals when possible (site:demandstar.com, site:bidsync.com, site:publicpurchase.com)
- Use "response due" OR "proposals due" OR "bid due" phrasing to surface active deadlines
- Mix different Occu-Med service lines across the 8 queries
- Use procurement terms: RFP, "request for proposal", solicitation, bid, contract

Respond ONLY with a JSON array of 8 query strings with no other text:
["query1", "query2", ..., "query8"]`;

    try {
      const text = await callGemini(apiKey, prompt, 600);
      const queries = JSON.parse(text);
      if (Array.isArray(queries) && queries.length > 0) return queries as string[];
    } catch (err: any) {
      if (err.message?.startsWith("GEMINI_QUOTA_EXCEEDED")) throw err;
      // fall through to defaults for other errors (parse errors, etc.)
    }

    return OCCUMED_DEFAULT_QUERIES;
  }

  /**
   * Analyze a web search result and extract structured opportunity data.
   * Returns null if the API call fails. Returns { isOpportunity: false } if the
   * result is not an actionable procurement opportunity.
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
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;

    const today = new Date().toISOString().split("T")[0];

    const prompt = `You are a strict procurement intelligence analyst for Occu-Med (occupational health services company).

Occu-Med services: ${OCCUMED_PROFILE.services.slice(0, 7).join("; ")}.
Today's date: ${today}

Analyze this web content. You must determine with HIGH CONFIDENCE whether this is a CURRENTLY OPEN solicitation that Occu-Med could bid on RIGHT NOW.

Title: ${title}
URL: ${url}
Content: ${content.slice(0, 3000)}

HARD REJECTION RULES — return isOpportunity: false immediately if ANY of these apply:
1. The content is a news article REPORTING on an RFP, not the actual solicitation posting
2. The deadline/due date has already passed (compare to today: ${today})
3. The title or content contains "awarded", "award notice", "contract award", "selected vendor"
4. The content is a job posting, career page, or employment ad
5. You cannot find clear evidence the solicitation is currently accepting proposals
6. The services needed have nothing to do with occupational health, medical exams, drug testing, or employee health
7. The content is a government regulation, policy, or federal register notice (not a bid)
8. The deadline year is ${new Date().getFullYear() - 1} or earlier

If this IS a currently open opportunity respond ONLY with JSON (no markdown, no explanation):
{
  "isOpportunity": true,
  "title": "exact solicitation title",
  "agency": "procuring organization name",
  "description": "specific health/medical services being procured (2-3 sentences)",
  "deadline": "YYYY-MM-DD — extract exact date from text, or null if not found",
  "estimatedValue": number or null,
  "location": "city, state or null",
  "relevanceScore": 0-100,
  "relevanceReason": "one sentence on Occu-Med fit"
}

If NOT a valid active opportunity respond ONLY with:
{"isOpportunity": false, "reason": "specific reason"}

Be precise — only return isOpportunity: true for real, currently open solicitations.`;

    try {
      const text = await callGemini(apiKey, prompt, 512);
      return JSON.parse(text);
    } catch (err: any) {
      if (err.message?.startsWith("GEMINI_QUOTA_EXCEEDED")) throw err;
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
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;

    const prompt = `You are a government contracting BD analyst.
Score the relevance of this opportunity to the organization described below.

Organization: ${orgContext}
Opportunity Title: ${opportunityTitle}
Description: ${description.slice(0, 2000)}

Respond ONLY with valid JSON:
{"score": <integer 0-100>, "explanation": "1-2 sentence explanation"}`;

    try {
      const text = await callGemini(apiKey, prompt, 256);
      return JSON.parse(text);
    } catch (err: any) {
      if (err.message?.startsWith("GEMINI_QUOTA_EXCEEDED")) throw err;
      return null;
    }
  }

  /**
   * Summarize and extract key signals from an opportunity description.
   */
  async summarizeOpportunity(
    opportunityTitle: string,
    description: string
  ): Promise<{
    summary: string;
    keySignals: string[];
    suggestedTags: string[];
    recommendedAction: string;
  } | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;

    const prompt = `You are a government contracting intelligence analyst.
Analyze this federal contracting opportunity and provide structured intelligence.

Title: ${opportunityTitle}
Description: ${description.slice(0, 3000)}

Respond ONLY with valid JSON:
{
  "summary": "2-3 sentence summary",
  "keySignals": ["signal 1", "signal 2", "signal 3"],
  "suggestedTags": ["tag1", "tag2"],
  "recommendedAction": "brief recommended next step"
}`;

    try {
      const text = await callGemini(apiKey, prompt, 512);
      return JSON.parse(text);
    } catch (err: any) {
      if (err.message?.startsWith("GEMINI_QUOTA_EXCEEDED")) throw err;
      return null;
    }
  }
}

export const geminiProvider = new GeminiProvider();
