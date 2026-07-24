import { OCCUMED_DEFAULT_QUERIES, OCCUMED_PROFILE, geminiProvider } from "../providers/gemini";
import { groqProvider } from "../providers/groq";
import { cerebrasProvider } from "../providers/openAiCompatible";

interface QueryProvider {
  name: string;
  isConfigured(): Promise<boolean>;
  complete(prompt: string, maxTokens?: number): Promise<string>;
}

export const AI_QUERY_PROVIDER_ORDER = ["cerebras", "groq", "gemini"] as const;
const PROVIDERS: QueryProvider[] = [cerebrasProvider, groqProvider, geminiProvider];

function parseQueries(text: string): string[] | null {
  const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      const queries = parsed.map(String).map((value) => value.trim()).filter(Boolean);
      return queries.length ? queries.slice(0, 12) : null;
    }
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        if (Array.isArray(parsed)) {
          const queries = parsed.map(String).map((value) => value.trim()).filter(Boolean);
          return queries.length ? queries.slice(0, 12) : null;
        }
      } catch {}
    }
  }
  return null;
}

function buildPrompt(focus?: string): string {
  const year = new Date().getFullYear();
  return `You are the primary procurement search strategist for Occu-Med.

Occu-Med services: ${OCCUMED_PROFILE.services.join("; ")}.
Client types: ${OCCUMED_PROFILE.clientTypes.join(", ")}.
${focus ? `Current focus and feedback signals: ${focus}` : ""}

Generate exactly 12 high-precision search-engine queries for CURRENTLY OPEN government and public-sector procurement opportunities in ${year}. Cover federal, state, local, school district, utility, transit, defense-contractor, and international public procurement terminology where relevant.

Requirements:
- Search strings only, not URLs.
- Include occupational-health synonyms and adjacent buyer language.
- Include procurement terms such as RFP, RFQ, solicitation, bid, tender, request for proposals, and response due.
- Exclude awards, closed notices, jobs, news coverage, regulations, and expired opportunities.
- Do not use the generic word "services" by itself as the relevance anchor.
- Return ONLY a JSON array of 12 strings.`;
}

export async function generateAiSearchQueries(focus?: string): Promise<{
  queries: string[];
  provider: string;
  rateLimited: boolean;
}> {
  let rateLimited = false;
  const prompt = buildPrompt(focus);

  for (const provider of PROVIDERS) {
    try {
      if (!(await provider.isConfigured())) continue;
      const text = await provider.complete(prompt, 1_800);
      const queries = parseQueries(text);
      if (queries) return { queries, provider: provider.name, rateLimited };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/429|rate limit|quota/i.test(message)) rateLimited = true;
    }
  }

  return {
    queries: OCCUMED_DEFAULT_QUERIES,
    provider: "deterministic-fallback",
    rateLimited,
  };
}
