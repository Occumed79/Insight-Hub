import { env } from "./env";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type ProviderName = "samGov" | "gemini" | "serper" | "tavily" | "tango" | "bidnet" | "statePortals" | "firecrawl" | "openrouter" | "groq" | "exa" | "browseAi" | "browserUse" | "olostep" | "clod" | "jina";

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
  status?: "live" | "partial" | "not_configured" | "coming_soon";
  notes?: string;
}

export interface ProviderField {
  key: string;
  label: string;
  type: "secret" | "text" | "url";
  placeholder: string;
  description?: string;
  dbKey: string; // key used in settingsTable
  envKey?: string; // fallback env var
}

export const PROVIDER_DEFINITIONS: Record<ProviderName, ProviderDefinition> = {
  samGov: {
    name: "samGov",
    displayName: "SAM.gov",
    description: "Direct source for U.S. federal contracting opportunities from System for Award Management.",
    category: "primary",
    useCase: "direct_source",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "Your SAM.gov API key",
        description: "Free API key from api.data.gov",
        dbKey: "samApiKey",
        envKey: "SAM_GOV_API_KEY",
      },
    ],
    optionalFields: [],
    docsUrl: "https://open.gsa.gov/api/opportunities2/",
    signupUrl: "https://api.data.gov/signup/",
    capabilities: [
      "Fetch live federal solicitations, awards, and presolicitations",
      "Search by keyword, agency, NAICS, PSC, set-aside",
      "Direct SAM.gov opportunity data with full notice detail",
    ],
    status: "live",
  },

  gemini: {
    name: "gemini",
    displayName: "Gemini AI",
    description: "Google Gemini powers intelligent opportunity discovery, query generation, relevance scoring, and research workflows across all data sources.",
    category: "ai",
    useCase: "hybrid",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "Your Gemini API key",
        description: "Available from Google AI Studio",
        dbKey: "geminiApiKey",
        envKey: "GEMINI_API_KEY",
      },
    ],
    optionalFields: [],
    docsUrl: "https://ai.google.dev/",
    signupUrl: "https://aistudio.google.com/apikey",
    capabilities: [
      "AI-driven opportunity discovery query generation",
      "Relevance scoring and fit analysis",
      "Opportunity summarization and signal extraction",
      "Research workflow orchestration and category tagging",
      "Source discovery strategy and result interpretation",
    ],
    status: "partial",
    notes: "Architecture is in place. Activate by providing your Gemini API key. Used for intelligent query generation, discovery strategy, and result scoring — not just summarization.",
  },

  serper: {
    name: "serper",
    displayName: "Serper",
    description: "Google Search API used to actively discover RFPs, solicitations, and contracting opportunities across the open web.",
    category: "search",
    useCase: "web_discovery",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "Your Serper API key",
        description: "Available at serper.dev",
        dbKey: "serperApiKey",
        envKey: "SERPER_API_KEY",
      },
    ],
    optionalFields: [],
    docsUrl: "https://serper.dev/docs",
    signupUrl: "https://serper.dev",
    capabilities: [
      "Active web discovery of RFPs and solicitations not in SAM.gov",
      "Agency and vendor market intelligence",
      "News, context, and signals around opportunities and competitors",
    ],
    status: "partial",
    notes: "Architecture is in place. Activate by providing your Serper API key. Functions as an active opportunity discovery source, not just enrichment.",
  },

  tavily: {
    name: "tavily",
    displayName: "Tavily",
    description: "AI-optimized research API used to discover and deeply investigate RFPs, procurement signals, and intelligence across the web.",
    category: "search",
    useCase: "research_analysis",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "Your Tavily API key",
        description: "Available at tavily.com",
        dbKey: "tavilyApiKey",
        envKey: "TAVILY_API_KEY",
      },
    ],
    optionalFields: [],
    docsUrl: "https://docs.tavily.com/",
    signupUrl: "https://app.tavily.com",
    capabilities: [
      "Deep web research for RFP and procurement discovery",
      "Competitor contract activity and market positioning",
      "Procurement context, history, and strategic intelligence",
    ],
    status: "partial",
    notes: "Architecture is in place. Activate by providing your Tavily API key. Used as an active research and discovery source for opportunities and intelligence.",
  },

  tango: {
    name: "tango",
    displayName: "Tango",
    description: "Direct procurement opportunity source. Adapter is scaffolded — awaiting API endpoint and authentication confirmation from Tango.",
    category: "procurement",
    useCase: "direct_source",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "Your Tango API key",
        description: "Requires account with Tango",
        dbKey: "tangoApiKey",
        envKey: "TANGO_API_KEY",
      },
    ],
    optionalFields: [],
    docsUrl: undefined,
    signupUrl: undefined,
    capabilities: ["Direct procurement opportunity sourcing", "Market intelligence"],
    status: "partial",
    notes: "Adapter stub is ready. To activate: provide your Tango API key and confirm the exact API endpoint and auth method with Tango support. API details are not publicly documented.",
  },

  bidnet: {
    name: "bidnet",
    displayName: "BidNet Direct",
    description: "Direct source for state and local government bids from BidNet Direct. Adapter is scaffolded — awaiting confirmed API access details.",
    category: "procurement",
    useCase: "direct_source",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "Your BidNet API key",
        description: "Requires BidNet Direct account",
        dbKey: "bidnetApiKey",
        envKey: "BIDNET_API_KEY",
      },
    ],
    optionalFields: [
      {
        key: "baseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: "https://api.bidnetdirect.com/...",
        description: "Custom API endpoint if provided by BidNet",
        dbKey: "bidnetBaseUrl",
        envKey: "BIDNET_BASE_URL",
      },
    ],
    docsUrl: undefined,
    signupUrl: "https://www.bidnetdirect.com",
    capabilities: ["State & local bid sourcing", "SLED market opportunities"],
    status: "partial",
    notes: "Adapter stub is ready. Provide your BidNet API key and base URL. Programmatic API access may require a specific BidNet subscription tier — confirm with BidNet support.",
  },

  statePortals: {
    name: "statePortals",
    displayName: "State Portals",
    description: "Searches 24 public state and regional procurement portals — DemandStar, California eProcure, Texas SmartBuy, Florida Marketplace, and more. No API key required.",
    category: "procurement",
    useCase: "web_discovery",
    requiredFields: [],
    optionalFields: [],
    docsUrl: undefined,
    signupUrl: undefined,
    capabilities: [
      "DemandStar — 80,000+ government agency solicitations",
      "California eProcure, Texas SmartBuy, Florida Marketplace, PA eMarketplace",
      "NC eProcurement, Washington WEBS, Georgia Bids, Illinois GEARS, Ohio Procurement",
      "GovTribe, PlanetBids, IonWave, Public Purchase, and more",
      "No API key required — uses Serper to search portal pages directly",
    ],
    status: "live",
    notes: "Requires Serper to be configured. Searches portals via Google site: queries — results are low-confidence and should be verified on the source portal.",
  },

  firecrawl: {
    name: "firecrawl",
    displayName: "FireCrawl",
    description: "Deep web scraping that converts any URL into clean markdown. Gives AI providers full page content instead of 2-sentence snippets, dramatically improving extraction accuracy.",
    category: "search",
    useCase: "web_discovery",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        description: "Available at firecrawl.dev",
        dbKey: "firecrawlApiKey",
        envKey: "FIRECRAWL_API_KEY",
      },
    ],
    optionalFields: [],
    docsUrl: "https://docs.firecrawl.dev",
    signupUrl: "https://firecrawl.dev",
    capabilities: [
      "Scrape any URL into clean markdown for AI analysis",
      "Removes ads, nav, and boilerplate — main content only",
      "Built-in web search with full-page results",
      "Batch scraping up to 5 URLs in parallel",
    ],
    status: "partial",
    notes: "When configured alongside Serper or Tavily, FireCrawl scrapes the full page content of discovered URLs so AI providers extract structured data from complete text rather than snippets.",
  },

  openrouter: {
    name: "openrouter",
    displayName: "OpenRouter",
    description: "Single API for 100+ AI models including Claude, GPT-4, Mistral, Llama, and Gemma. Use as a flexible AI backend for query generation, extraction, and scoring.",
    category: "ai",
    useCase: "hybrid",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "sk-or-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        description: "Available at openrouter.ai",
        dbKey: "openrouterApiKey",
        envKey: "OPENROUTER_API_KEY",
      },
    ],
    optionalFields: [
      {
        key: "model",
        label: "Model ID",
        type: "text",
        placeholder: "meta-llama/llama-3.1-8b-instruct:free",
        description: "Any model from openrouter.ai/models — defaults to Llama 3.1 8B (free tier)",
        dbKey: "openrouterModel",
        envKey: "OPENROUTER_MODEL",
      },
    ],
    docsUrl: "https://openrouter.ai/docs",
    signupUrl: "https://openrouter.ai",
    capabilities: [
      "Access to 100+ models via one API key",
      "Claude, GPT-4, Mistral, Llama, Gemma and more",
      "Opportunity query generation and extraction",
      "Relevance scoring and intelligence research",
      "Free-tier models available at zero cost",
    ],
    status: "partial",
    notes: "Acts as an alternative or complement to Gemini. Configure a free model like meta-llama/llama-3.1-8b-instruct:free to get AI-powered discovery without per-call costs.",
  },

  groq: {
    name: "groq",
    displayName: "Groq",
    description: "Ultra-fast AI inference for Llama 3, Mixtral, and Gemma models. Ideal for high-volume, latency-sensitive extraction steps in the opportunity discovery pipeline.",
    category: "ai",
    useCase: "hybrid",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        description: "Available at console.groq.com",
        dbKey: "groqApiKey",
        envKey: "GROQ_API_KEY",
      },
    ],
    optionalFields: [
      {
        key: "model",
        label: "Model ID",
        type: "text",
        placeholder: "llama-3.1-8b-instant",
        description: "Groq model to use — defaults to llama-3.1-8b-instant. Options: llama3-70b-8192, mixtral-8x7b-32768, gemma2-9b-it",
        dbKey: "groqModel",
        envKey: "GROQ_MODEL",
      },
    ],
    docsUrl: "https://console.groq.com/docs",
    signupUrl: "https://console.groq.com",
    capabilities: [
      "Fastest open-source model inference available",
      "Llama 3.1, Mixtral 8x7B, Gemma 2 support",
      "High-volume per-URL extraction at low latency",
      "Free tier with generous rate limits",
      "Opportunity query generation and scoring",
    ],
    status: "partial",
    notes: "Groq's speed makes it ideal for bulk extraction — processing dozens of search results in seconds. Pairs well with FireCrawl for full-page content analysis at scale.",
  },

  exa: {
    name: "exa",
    displayName: "Exa",
    description: "Neural search engine designed for AI use cases. Understands semantic intent, not just keywords. Supports deep multi-query search with structured output extraction and full-page content.",
    category: "search",
    useCase: "web_discovery",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        description: "Available at dashboard.exa.ai",
        dbKey: "exaApiKey",
        envKey: "EXA_API_KEY",
      },
    ],
    optionalFields: [],
    docsUrl: "https://docs.exa.ai",
    signupUrl: "https://dashboard.exa.ai",
    capabilities: [
      "Neural semantic search — finds relevant results by intent, not keywords",
      "Deep multi-query search with structured JSON output",
      "Full-page content retrieval for RAG pipelines",
      "People, company, news, and research paper category search",
      "Field-level citations and confidence scores",
    ],
    status: "partial",
    notes: "Best-in-class for finding semantically relevant procurement opportunities. Deep search mode runs multiple query variations and synthesizes results — ideal for thorough opportunity discovery.",
  },

  browseAi: {
    name: "browseAi",
    displayName: "Browse AI",
    description: "No-code web scraping via pre-configured robots. Define scraping workflows on the Browse AI dashboard, then trigger them via API to extract structured data from any website.",
    category: "search",
    useCase: "web_discovery",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        description: "Full key in userId:apiKey format — found in Browse AI dashboard",
        dbKey: "browseAiApiKey",
        envKey: "BROWSE_AI_API_KEY",
      },
    ],
    optionalFields: [
      {
        key: "robotId",
        label: "Default Robot ID",
        type: "text",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        description: "Robot ID to run by default — create robots at browse.ai/dashboard",
        dbKey: "browseAiRobotId",
        envKey: "BROWSE_AI_ROBOT_ID",
      },
    ],
    docsUrl: "https://docs.browse.ai/docs/api",
    signupUrl: "https://browse.ai",
    capabilities: [
      "Run pre-configured scraping robots via API",
      "Extract structured data from dynamic/JS-heavy sites",
      "Capture tables, lists, screenshots, and text",
      "Schedule recurring scrapes or trigger on demand",
    ],
    status: "partial",
    notes: "Create a robot on the Browse AI dashboard targeting a procurement portal (e.g. BidSync, DemandStar). Set the Robot ID here, then trigger it from research workflows to pull structured opportunity data.",
  },

  browserUse: {
    name: "browserUse",
    displayName: "BrowserUse AI",
    description: "AI-powered browser automation. Give it a natural-language task and it autonomously navigates, clicks, fills forms, and extracts data from any web application — bypassing bot protection.",
    category: "search",
    useCase: "web_discovery",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "bu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        description: "Available at browser-use.com",
        dbKey: "browserUseApiKey",
        envKey: "BROWSER_USE_API_KEY",
      },
    ],
    optionalFields: [],
    docsUrl: "https://docs.browser-use.com",
    signupUrl: "https://browser-use.com",
    capabilities: [
      "Autonomous browser control via natural language instructions",
      "Handles login flows, pagination, dynamic content",
      "Bypasses Cloudflare and bot detection with real browser",
      "Extracts structured data from complex web applications",
      "Ideal for portals that block API scraping",
    ],
    status: "partial",
    notes: "Best for procurement portals that require authentication or JavaScript interaction. Instruct it to 'navigate to X portal, search for occupational health RFPs, and return titles with deadlines.'",
  },

  olostep: {
    name: "olostep",
    displayName: "Olostep",
    description: "Residential-proxy web scraping. Routes requests through real residential IPs to bypass bot detection and Cloudflare on procurement portals. Returns clean markdown for AI analysis.",
    category: "search",
    useCase: "web_discovery",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "olostep_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        description: "Available at olostep.com",
        dbKey: "olostepApiKey",
        envKey: "OLOSTEP_API_KEY",
      },
    ],
    optionalFields: [],
    docsUrl: "https://www.olostep.com/docs",
    signupUrl: "https://olostep.com",
    capabilities: [
      "Residential IP proxies — bypasses Cloudflare and bot detection",
      "Returns clean markdown, HTML, or plain text",
      "Batch scraping up to 5 URLs in parallel",
      "Handles JavaScript-rendered pages",
    ],
    status: "partial",
    notes: "Ideal complement to FireCrawl — use Olostep for sites that block conventional scrapers. Residential proxies make requests look like real user traffic.",
  },

  clod: {
    name: "clod",
    displayName: "CLōD AI",
    description: "OpenAI-compatible AI endpoint for your CLōD project. Provides query generation, opportunity extraction, and relevance scoring via the api.clod.io inference endpoint.",
    category: "ai",
    useCase: "hybrid",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key (JWT)",
        type: "secret",
        placeholder: "eyJhbGci...",
        description: "JWT token from your CLōD project settings",
        dbKey: "clodApiKey",
        envKey: "CLOD_API_KEY",
      },
    ],
    optionalFields: [
      {
        key: "model",
        label: "Model ID",
        type: "text",
        placeholder: "claude-sonnet-4-5",
        description: "Model to use via the CLōD endpoint — defaults to claude-sonnet-4-5",
        dbKey: "clodModel",
        envKey: "CLOD_MODEL",
      },
    ],
    docsUrl: "https://api.clod.io/v1",
    signupUrl: "https://clod.io",
    capabilities: [
      "OpenAI-compatible endpoint at api.clod.io",
      "Opportunity query generation and extraction",
      "Relevance scoring and intelligence analysis",
      "Configurable model selection",
    ],
    status: "partial",
    notes: "Uses your CLōD project JWT as the API key. Set endpoint to https://api.clod.io/v1. Functions identically to OpenRouter/Groq — can run query generation, extraction, and scoring workflows.",
  },

  jina: {
    name: "jina",
    label: "Jina AI Reader",
    description: "Converts any URL into clean markdown content for AI analysis. Complements FireCrawl for web content extraction.",
    requiredFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        placeholder: "jina_...",
        description: "Available at jina.ai",
        dbKey: "jinaApiKey",
        envKey: "JINA_API_KEY",
      },
    ],
    optionalFields: [],
    docsUrl: "https://jina.ai/reader/",
    signupUrl: "https://jina.ai",
    capabilities: [
      "URL to clean markdown extraction",
      "Used to enrich web search results with full page content",
      "Faster and cheaper than full browser rendering",
    ],
    status: "active",
  },
};

/**
 * Get a setting value from DB first, then fall back to environment variable.
 */
export async function resolveCredential(dbKey: string, envKey?: string): Promise<string | null> {
  // Check DB first (user-configured)
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, dbKey));
  if (rows[0]?.value) return rows[0].value;

  // Fall back to environment variable
  if (envKey) {
    const val = process.env[envKey];
    if (val) return val;
  }

  return null;
}

