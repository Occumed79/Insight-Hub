import { env } from "./env";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type ProviderName = "samGov" | "gemini" | "serper" | "tavily" | "tango" | "bidnet" | "statePortals";

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
