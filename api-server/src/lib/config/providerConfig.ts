import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type ProviderName =
  | "samGov"
  | "texasEsbd"
  | "nyScr"
  | "publicPortalProviders"
  | "eunaBonfire"
  | "internationalPublicPortals"
  | "gemini"
  | "serper"
  | "tavily"
  | "tango"
  | "bidnet"
  | "firecrawl"
  | "openrouter"
  | "groq"
  | "exa"
  | "browseAi"
  | "browserUse"
  | "olostep"
  | "clod"
  | "jina"
  | "minimax"
  | "you"
  | "langsearch"
  | "websearch"
  | "grantsGov"
  | "usaSpending"
  | "federalRegister"
  | "cerebras"
  | "cohere"
  | "deepseek"
  | "fal"
  | "mistral"
  | "nvidia"
  | "pinecone"
  | "qdrant"
  | "cloudflareWorker"
  | "mongoDb"
  | "voyage"
  | "huggingFace";

export type RfpProviderName = Exclude<ProviderName, "usaSpending" | "federalRegister">;

/** Providers that are valid inputs to the RFP ingestion pipeline. */
export const RFP_INGESTION_PROVIDER_NAMES = [
  "samGov",
  "publicPortalProviders",
  "eunaBonfire",
  "internationalPublicPortals",
  "tango",
  "bidnet",
  "serper",
  "tavily",
  "exa",
] as const satisfies readonly ProviderName[];

export type RfpIngestionProviderName =
  (typeof RFP_INGESTION_PROVIDER_NAMES)[number];

const RFP_INGESTION_PROVIDER_SET = new Set<string>(
  RFP_INGESTION_PROVIDER_NAMES,
);

export function isRfpIngestionProviderName(
  value: string,
): value is RfpIngestionProviderName {
  return RFP_INGESTION_PROVIDER_SET.has(value);
}

export type ProviderUseCase = "direct_source" | "web_discovery" | "research_analysis" | "hybrid";

export interface ProviderDefinition {
  name: RfpProviderName;
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
  name: RfpProviderName,
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

export const PROVIDER_DEFINITIONS: Record<RfpProviderName, ProviderDefinition> = {
  samGov: provider("samGov", "SAM.gov", "primary", "direct_source", [secretField("samApiKey", "SAM_GOV_API_KEY")], ["Federal solicitations", "Awards", "Presolicitations"], "live", "Direct source for U.S. federal contracting opportunities from System for Award Management."),
  texasEsbd: provider("texasEsbd", "Texas ESBD / Texas SmartBuy", "primary", "direct_source", [], ["Texas public solicitations", "Due dates", "Solicitation IDs", "Official buyer portal"], "live", "Dedicated parser for the official Texas ESBD / Texas SmartBuy public listing. It does not yet provide complete pagination or document collection."),
  nyScr: provider("nyScr", "New York State Contract Reporter", "primary", "direct_source", [], ["New York public solicitations", "CR numbers", "Issue/due dates", "Official buyer portal"], "live", "Dedicated parser for the official New York State Contract Reporter public listing. It does not yet provide complete pagination or document collection."),
  publicPortalProviders: provider("publicPortalProviders", "U.S. Public Portals", "procurement", "hybrid", [], ["Two dedicated official listing adapters", "Generic one-page extraction for eligible public pages", "Serper official-domain discovery fallback", "Cross-path deduplication", "Per-domain rate limiting"], "partial", "Hybrid U.S. portal source. Texas ESBD and NYSCR have dedicated adapters; other eligible public pages use generic extraction, while unsupported portals rely on Serper discovery. Catalog inclusion is not equivalent to a completed connector."),
  eunaBonfire: provider("eunaBonfire", "Euna Supplier Network", "procurement", "web_discovery", [], ["Serper discovery of public Bonfire/Euna pages", "Occu-Med relevance filtering", "Cross-provider deduplication"], "partial", "Search-discovery source using the configured Serper key. It is not a direct Euna API or supplier-feed integration, and no Euna credentials are stored."),
  internationalPublicPortals: provider("internationalPublicPortals", "International Public Portals", "procurement", "web_discovery", [], ["Serper discovery on official international domains", "Canada, United Kingdom, Europe, and multilateral directory coverage", "International buyer and jurisdiction metadata", "Cross-provider deduplication"], "partial", "Search-discovery source covering the official international portal directory. Direct CanadaBuys, Contracts Finder, TED, and other portal connectors are not yet implemented."),
  gemini: provider("gemini", "Gemini AI", "ai", "hybrid", [secretField("geminiApiKey", "GEMINI_API_KEY")], ["Query generation", "Extraction", "Relevance scoring"], "partial", "Google Gemini powers intelligent opportunity discovery and scoring."),
  serper: provider("serper", "Serper", "search", "web_discovery", [secretField("serperApiKey", "SERPER_API_KEY")], ["Google search API", "RFP discovery", "Procurement signals"], "partial"),
  tavily: provider("tavily", "Tavily", "search", "research_analysis", [secretField("tavilyApiKey", "TAVILY_API_KEY")], ["Research API", "RFP discovery", "Market intelligence"], "partial"),
  tango: {
    ...provider("tango", "Tango", "procurement", "direct_source", [secretField("tangoApiKey", "TANGO_API_KEY")], ["Direct procurement API", "Structured opportunity metadata"], "partial", "Direct Tango by MakeGov API integration. Current collection requests the first result page only."),
    optionalFields: [{ key: "baseUrl", label: "API Base URL", type: "url", placeholder: "https://tango.makegov.com/api/", dbKey: "tangoBaseUrl", envKey: "TANGO_BASE_URL" }],
  },
  bidnet: {
    ...provider("bidnet", "BidNet Direct", "procurement", "direct_source", [secretField("bidnetApiKey", "BIDNET_API_KEY")], ["Planned state and local bid access"], "coming_soon", "Configuration scaffold only. The direct endpoint, authentication contract, and response mapping are not implemented."),
    optionalFields: [{ key: "baseUrl", label: "API Base URL", type: "url", placeholder: "BidNet API base URL", dbKey: "bidnetBaseUrl", envKey: "BIDNET_BASE_URL" }],
  },
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
  jina: provider("jina", "Jina AI Reader", "search", "web_discovery", [secretField("jinaApiKey", "JINA_API_KEY")], ["URL to markdown", "Content enrichment", "Embeddings for semantic rerank"], "active"),
  minimax: provider("minimax", "Minimax AI", "ai", "hybrid", [secretField("minimaxApiKey", "MINIMAX_API_KEY")], ["Opportunity extraction", "Relevance scoring"], "partial"),
  you: provider("you", "You.com", "search", "web_discovery", [secretField("youApiKey", "YOU_API_KEY")], ["Web search", "Opportunity sourcing"], "partial"),
  langsearch: provider("langsearch", "Langsearch", "search", "web_discovery", [secretField("langsearchApiKey", "LANGSEARCH_API_KEY")], ["LLM-native search", "Opportunity sourcing"], "partial"),
  websearch: provider("websearch", "WebSearch API", "search", "web_discovery", [secretField("websearchApiKey", "WEBSEARCH_API_KEY")], ["Broad web search", "Opportunity sourcing"], "partial"),
  grantsGov: {
    ...provider("grantsGov", "Grants.gov", "primary", "research_analysis", [], ["Federal grants search", "Health program funding discovery"], "live", "Public federal grants database — no API key required."),
    notes: "Funding and program intelligence only. Grants.gov is excluded from RFP opportunity ingestion and cards.",
  },

  cerebras: provider("cerebras", "Cerebras", "ai", "hybrid", [secretField("cerebrasApiKey", "CEREBRAS_API_KEY")], ["AI extraction", "Fast inference", "Scoring failover"], "active"),
  cohere: provider("cohere", "Cohere", "ai", "research_analysis", [secretField("cohereApiKey", "COHERE_API_KEY")], ["Semantic reranking", "Opportunity relevance scoring"], "active"),
  deepseek: provider("deepseek", "DeepSeek", "ai", "hybrid", [secretField("deepseekApiKey", "DEEPSEEK_API_KEY")], ["AI extraction", "Reasoning", "Scoring failover"], "active"),
  fal: provider("fal", "Fal.ai", "ai", "research_analysis", [secretField("falApiKey", "FAL_API_KEY")], ["Media/model utility workflows"], "partial"),
  mistral: provider("mistral", "Mistral", "ai", "hybrid", [secretField("mistralApiKey", "MISTRAL_API_KEY")], ["AI extraction", "Structured generation", "Scoring failover"], "active"),
  nvidia: provider("nvidia", "NVIDIA NIM", "ai", "hybrid", [secretField("nvidiaApiKey", "NVIDIA_API_KEY")], ["AI extraction", "Open model inference", "Scoring failover"], "active"),
  pinecone: {
    ...provider("pinecone", "Pinecone", "search", "research_analysis", [secretField("pineconeApiKey", "PINECONE_API_KEY"), { key: "indexHost", label: "Index Host", type: "url", placeholder: "https://your-index.svc.region.pinecone.io", dbKey: "pineconeIndexHost", envKey: "PINECONE_INDEX_HOST" }], ["Vector storage", "Similarity search", "Opportunity retrieval memory"], "active"),
    optionalFields: [{ key: "namespace", label: "Namespace", type: "text", placeholder: "opportunities", dbKey: "pineconeNamespace", envKey: "PINECONE_NAMESPACE" }],
  },
  qdrant: {
    ...provider("qdrant", "Qdrant", "search", "research_analysis", [{ key: "url", label: "Qdrant URL", type: "url", placeholder: "https://your-cluster.qdrant.io", dbKey: "qdrantUrl", envKey: "QDRANT_URL" }, secretField("qdrantApiKey", "QDRANT_API_KEY")], ["Vector storage", "Similarity search", "Opportunity retrieval memory"], "active"),
    optionalFields: [{ key: "collection", label: "Collection", type: "text", placeholder: "insight_hub_opportunities", dbKey: "qdrantCollection", envKey: "QDRANT_COLLECTION" }],
  },
  cloudflareWorker: provider("cloudflareWorker", "Cloudflare Worker API", "search", "web_discovery", [secretField("cloudflareWorkerApi", "CLOUDFLARE_WORKER_API", "Worker API URL")], ["Edge extraction endpoint", "Crawler/proxy utility"], "active"),
  mongoDb: provider("mongoDb", "MongoDB API", "search", "research_analysis", [secretField("mongoDbApi", "MONGO_DB_API", "MongoDB API Key / URL")], ["External document store", "Future enrichment cache"], "partial"),
  voyage: provider("voyage", "Voyage AI", "ai", "research_analysis", [secretField("voyageApiKey", "VOYAGE_API_KEY")], ["Embeddings", "Semantic similarity", "Vector indexing fallback"], "active"),
  huggingFace: provider("huggingFace", "Hugging Face", "ai", "hybrid", [secretField("huggingFaceApiKey", "HUGGINGFACE_API_KEY")], ["Embeddings", "Model inference", "Vector indexing fallback"], "active"),
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
