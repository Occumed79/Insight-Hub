import { env } from "./env";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type ProviderName = "samGov" | "gemini" | "serper" | "tavily" | "tango" | "bidnet" | "statePortals" | "firecrawl" | "openrouter" | "groq" | "exa" | "browseAi" | "browserUse" | "olostep" | "clod" | "jina" | "minimax" | "you" | "langsearch" | "websearch" | "grantsGov" | "usaSpending";

export type ProviderUseCase = "direct_source" | "web_discovery" | "research_analysis" | "hybrid";

export interface ProviderDefinition {
  name: ProviderName;
  displayName: string;
  description: string;
  category: "primary" | "ai" | "search" | "procurement";
  useCase: ProviderUseCase;
  requiredFields: ProviderField[];
  optionalFields: ProviderField[];
  docsUrl?: string;
  signupUrl?: string;
  capabilities: string[];
  status?: "live" | "partial" | "not_configured" | "coming_soon" | "active";
  notes?: string;
}

export interface ProviderField {
  key: string;
  label: string;
  type: "secret" | "text" | "url";
  placeholder: string;
  description?: string;
  dbKey: string;
  envKey?: string;
}

const secretField = (dbKey: string, envKey: string, label = "API Key"): ProviderField => ({
  key: "apiKey",
  label,
  type: "secret",
  placeholder: `Your ${label}`,
  dbKey,
  envKey,
});

const provider = (
  name: ProviderName,
  displayName: string,
  category: ProviderDefinition["category"],
  useCase: ProviderUseCase,
  requiredFields: ProviderField[],
  capabilities: string[],
  status: ProviderDefinition["status"] = "partial",
  description = `${displayName} data source for opportunity intelligence.`,
): ProviderDefinition => ({
  name,
  displayName,
  description,
  category,
  useCase,
  requiredFields,
  optionalFields: [],
  capabilities,
  status,
});

export const PROVIDER_DEFINITIONS: Record<ProviderName, ProviderDefinition> = {
  samGov: provider("samGov", "SAM.gov", "primary", "direct_source", [secretField("samApiKey", "SAM_GOV_API_KEY")], ["Federal solicitations", "Awards", "Presolicitations"], "live", "Direct source for U.S. federal contracting opportunities from System for Award Management."),
  gemini: provider("gemini", "Gemini AI", "ai", "hybrid", [secretField("geminiApiKey", "GEMINI_API_KEY")], ["Query generation", "Extraction", "Relevance scoring"], "partial", "Google Gemini powers intelligent opportunity discovery and scoring."),
  serper: provider("serper", "Serper", "search", "web_discovery", [secretField("serperApiKey", "SERPER_API_KEY")], ["Google search API", "RFP discovery", "Procurement signals"], "partial"),
  tavily: provider("tavily", "Tavily", "search", "research_analysis", [secretField("tavilyApiKey", "TAVILY_API_KEY")], ["Research API", "RFP discovery", "Market intelligence"], "partial"),
  tango: provider("tango", "Tango", "procurement", "direct_source", [secretField("tangoApiKey", "TANGO_API_KEY")], ["Direct procurement source"], "partial"),
  bidnet: {
    ...provider("bidnet", "BidNet Direct", "procurement", "direct_source", [secretField("bidnetApiKey", "BIDNET_API_KEY")], ["State and local bids"], "partial"),
    optionalFields: [{ key: "baseUrl", label: "API Base URL", type: "url", placeholder: "BidNet API base URL", dbKey: "bidnetBaseUrl", envKey: "BIDNET_BASE_URL" }],
  },
  statePortals: provider("statePortals", "State Portals", "procurement", "web_discovery", [], ["State procurement portal search"], "live"),
  firecrawl: provider("firecrawl", "FireCrawl", "search", "web_discovery", [secretField("firecrawlApiKey", "FIRECRAWL_API_KEY")], ["Full-page scraping", "Markdown extraction"], "partial"),
  openrouter: {
    ...provider("openrouter", "OpenRouter", "ai", "hybrid", [secretField("openrouterApiKey", "OPENROUTER_API_KEY")], ["AI model routing", "Extraction", "Scoring"], "partial"),
    optionalFields: [{ key: "model", label: "Model ID", type: "text", placeholder: "OpenRouter model", dbKey: "openrouterModel", envKey: "OPENROUTER_MODEL" }],
  },
  groq: {
    ...provider("groq", "Groq", "ai", "hybrid", [secretField("groqApiKey", "GROQ_API_KEY")], ["Fast AI inference", "Extraction", "Scoring"], "partial"),
    optionalFields: [{ key: "model", label: "Model ID", type: "text", placeholder: "Groq model", dbKey: "groqModel", envKey: "GROQ_MODEL" }],
  },
  exa: provider("exa", "Exa", "search", "web_discovery", [secretField("exaApiKey", "EXA_API_KEY")], ["Neural search", "Semantic discovery"], "partial"),
  browseAi: {
    ...provider("browseAi", "Browse AI", "search", "web_discovery", [secretField("browseAiApiKey", "BROWSE_AI_API_KEY")], ["Scraping robots", "Structured extraction"], "partial"),
    optionalFields: [{ key: "robotId", label: "Default Robot ID", type: "text", placeholder: "Browse AI robot ID", dbKey: "browseAiRobotId", envKey: "BROWSE_AI_ROBOT_ID" }],
  },
  browserUse: provider("browserUse", "BrowserUse AI", "search", "web_discovery", [secretField("browserUseApiKey", "BROWSER_USE_API_KEY")], ["Browser automation", "Dynamic site extraction"], "partial"),
  olostep: provider("olostep", "Olostep", "search", "web_discovery", [secretField("olostepApiKey", "OLOSTEP_API_KEY")], ["Residential proxy scraping", "Blocked portal access"], "partial"),
  clod: {
    ...provider("clod", "CLōD AI", "ai", "hybrid", [secretField("clodApiKey", "CLOD_API_KEY", "API Key (JWT)")], ["AI extraction", "Scoring"], "partial"),
    optionalFields: [{ key: "model", label: "Model ID", type: "text", placeholder: "CLōD model", dbKey: "clodModel", envKey: "CLOD_MODEL" }],
  },
  jina: provider("jina", "Jina AI Reader", "search", "web_discovery", [secretField("jinaApiKey", "JINA_API_KEY")], ["URL to markdown", "Content enrichment"], "active"),
  minimax: provider("minimax", "Minimax AI", "ai", "hybrid", [secretField("minimaxApiKey", "MINIMAX_API_KEY")], ["Opportunity extraction", "Relevance scoring"], "partial"),
  you: provider("you", "You.com", "search", "web_discovery", [secretField("youApiKey", "YOU_API_KEY")], ["Web search", "Opportunity sourcing"], "partial"),
  langsearch: provider("langsearch", "Langsearch", "search", "web_discovery", [secretField("langsearchApiKey", "LANGSEARCH_API_KEY")], ["LLM-native search", "Opportunity sourcing"], "partial"),
  websearch: provider("websearch", "WebSearch API", "search", "web_discovery", [secretField("websearchApiKey", "WEBSEARCH_API_KEY")], ["Broad web search", "Opportunity sourcing"], "partial"),
  grantsGov: provider("grantsGov", "Grants.gov", "primary", "direct_source", [], ["Federal grants search", "Health program funding discovery"], "live", "Public federal grants database — no API key required."),
  usaSpending: provider("usaSpending", "USASpending.gov", "primary", "direct_source", [], ["Expiring contract discovery", "Re-compete intelligence", "Incumbent tracking"], "live", "Public federal spending database — no API key required."),
};

export async function resolveCredential(dbKey: string, envKey?: string): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, dbKey));
  if (rows[0]?.value) return rows[0].value;

  if (envKey) {
    const val = process.env[envKey];
    if (val) return val;
  }

  return null;
}
