/** Gemini AI provider for query generation, extraction, and relevance scoring. */
import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { FreeTierCredentialPool } from "./freeTierCredentialPool";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const credentials = new FreeTierCredentialPool(
  "gemini-multi-account",
  [
    { dbKey: "geminiApiKey", envKey: "GEMINI_API_KEY" },
    { envKey: "GEMINI_KEY_2" },
    { envKey: "GEMINI_KEY_3" },
  ],
  { rotateOnSuccess: false },
);

export const OCCUMED_PROFILE = {
  company: "Occu-Med",
  website: "https://www.occu-med.com",
  services: [
    "Occupational health and medicine services",
    "Pre-employment physical examinations and health screenings",
    "DOT physical examinations and compliance",
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
    "occupational health",
    "occupational medicine",
    "employee health",
    "pre-employment physical",
    "pre-employment screening",
    "drug testing",
    "drug screening",
    "DOT physical",
    "medical examiner",
    "fit for duty",
    "hearing conservation",
    "audiometric testing",
    "respirator fit test",
    "workplace health",
    "return to work",
    "medical surveillance",
    "OSHA compliance",
  ],
};

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

async function callGemini(
  apiKey: string,
  prompt: string,
  maxTokens = 512,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${GEMINI_BASE}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
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
      `GEMINI_QUOTA_EXCEEDED: ${body?.error?.message ?? "Rate limit reached"}`,
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini API error ${response.status}: ${body.slice(0, 200)}`);
  }
  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (json.candidates?.[0]?.content?.parts?.[0]?.text ?? "")
    .replace(/```json\n?/g, "")
    .replace(/```/g, "")
    .trim();
}

export class GeminiProvider implements DataSourceProvider {
  readonly name = "gemini" as const;

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
    return credentials.run((apiKey) =>
      callGemini(apiKey, prompt, maxTokens, signal),
    );
  }

  async generateSearchQueries(customKeywords?: string): Promise<string[]> {
    if (!(await this.isConfigured())) return OCCUMED_DEFAULT_QUERIES;
    const prompt = `You are a procurement intelligence specialist helping Occu-Med find relevant contracting opportunities.\nOccu-Med provides: ${OCCUMED_PROFILE.services.slice(0, 8).join("; ")}.\nThey serve: ${OCCUMED_PROFILE.clientTypes.join(", ")}.\n${customKeywords ? `User-specified focus: ${customKeywords}` : ""}\nGenerate exactly 8 targeted web search queries for ACTIVE RFPs, solicitations, bids, and supplier opportunities in ${QUERY_YEAR}. Include -awarded -"contract award" -"award notice" in each query. Respond ONLY with a JSON array of 8 strings.`;
    try {
      const queries = JSON.parse(await this.complete(prompt, 600));
      if (Array.isArray(queries) && queries.length > 0) return queries as string[];
    } catch (error) {
      if (/GEMINI_QUOTA_EXCEEDED/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
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
    if (!(await this.isConfigured())) return null;
    const today = new Date().toISOString().split("T")[0];
    const prompt = `You are a strict procurement analyst for Occu-Med. Today is ${today}. Determine whether the following is a CURRENTLY OPEN procurement relevant to occupational health, workforce medical screening, drug testing, physical examinations, medical surveillance, audiometry, spirometry, respirator programs, or fitness-for-duty. Reject awards, expired notices, jobs, news, regulations, and unrelated patient care.\nTitle: ${title}\nURL: ${url}\nContent: ${content.slice(0, 3000)}\nReturn JSON only. If accepted include isOpportunity:true,title,agency,description,deadline,estimatedValue,location,relevanceScore,relevanceReason. Otherwise return isOpportunity:false and reason.`;
    try {
      return JSON.parse(await this.complete(prompt, 512));
    } catch (error) {
      if (/GEMINI_QUOTA_EXCEEDED/i.test(error instanceof Error ? error.message : String(error))) throw error;
      return null;
    }
  }

  async scoreRelevance(
    opportunityTitle: string,
    description: string,
    orgContext: string,
  ): Promise<{ score: number; explanation: string } | null> {
    if (!(await this.isConfigured())) return null;
    const prompt = `Score relevance 0-100.\nOrganization: ${orgContext}\nOpportunity: ${opportunityTitle}\nDescription: ${description.slice(0, 2000)}\nRespond ONLY with JSON: {"score":<integer>,"explanation":"1-2 sentences"}`;
    try {
      return JSON.parse(await this.complete(prompt, 256));
    } catch (error) {
      if (/GEMINI_QUOTA_EXCEEDED/i.test(error instanceof Error ? error.message : String(error))) throw error;
      return null;
    }
  }
}

export const geminiProvider = new GeminiProvider();
