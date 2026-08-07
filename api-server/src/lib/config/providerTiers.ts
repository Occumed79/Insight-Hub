/**
 * Provider Tier Configuration
 *
 * Defines the stability hierarchy of providers to prioritize stable, self-hosted,
 * and direct government sources over external APIs with rate limits and API keys.
 *
 * Tier 1 (Most Stable): Direct government sources, self-hosted services
 * Tier 2 (Moderately Stable): External APIs with good reliability
 * Tier 3 (Fallback): External APIs with rate limits or reliability issues
 */

import type { ProviderName } from "./providerConfig";

export type ProviderTier = "tier1" | "tier2" | "tier3" | "disabled";

export interface ProviderTierConfig {
  name: ProviderName;
  tier: ProviderTier;
  requiresApiKey: boolean;
  requiresSelfHosted: boolean;
  description: string;
  priority: number; // Lower number = higher priority within tier
}

/**
 * Provider tier definitions
 * 
 * Tier 1: No API keys required, self-hosted or direct government sources
 * Tier 2: External APIs with good reliability but require API keys
 * Tier 3: External APIs with rate limits or reliability issues
 * Disabled: Providers that should not be used in production
 */
export const PROVIDER_TIERS: Record<ProviderName, ProviderTierConfig> = {
  // === Tier 1: Most Stable (No API Keys, Self-Hosted or Direct Government) ===
  samGov: {
    name: "samGov",
    tier: "tier1",
    requiresApiKey: false,
    requiresSelfHosted: false,
    description: "Official federal government procurement portal",
    priority: 1,
  },
  tango: {
    name: "tango",
    tier: "tier1",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Federal structured data provider",
    priority: 2,
  },
  texasEsbd: {
    name: "texasEsbd",
    tier: "tier1",
    requiresApiKey: false,
    requiresSelfHosted: false,
    description: "Texas state official procurement portal",
    priority: 3,
  },
  nyScr: {
    name: "nyScr",
    tier: "tier1",
    requiresApiKey: false,
    requiresSelfHosted: false,
    description: "New York state official procurement portal",
    priority: 4,
  },
  rssAggregator: {
    name: "rssAggregator",
    tier: "tier1",
    requiresApiKey: false,
    requiresSelfHosted: false,
    description: "Aggregates RSS feeds from government portals",
    priority: 5,
  },
  emailNotifications: {
    name: "emailNotifications",
    tier: "tier1",
    requiresApiKey: false,
    requiresSelfHosted: false,
    description: "Email-based opportunity notification ingestion",
    priority: 6,
  },
  selfHostedCrawler: {
    name: "selfHostedCrawler",
    tier: "tier1",
    requiresApiKey: false,
    requiresSelfHosted: true,
    description: "Self-hosted web crawler (Playwright-based)",
    priority: 7,
  },
  localLlm: {
    name: "localLlm",
    tier: "tier1",
    requiresApiKey: false,
    requiresSelfHosted: true,
    description: "Local LLM (Ollama/LocalAI) for AI extraction",
    priority: 8,
  },
  selfHostedSearch: {
    name: "selfHostedSearch",
    tier: "tier1",
    requiresApiKey: false,
    requiresSelfHosted: true,
    description: "Self-hosted search engine (Meilisearch/Typesense)",
    priority: 9,
  },
  publicPortalProviders: {
    name: "publicPortalProviders",
    tier: "tier1",
    requiresApiKey: false,
    requiresSelfHosted: false,
    description: "Direct integration with public government portals",
    priority: 10,
  },
  grantsGov: {
    name: "grantsGov",
    tier: "tier1",
    requiresApiKey: false,
    requiresSelfHosted: false,
    description: "Official federal grants portal",
    priority: 11,
  },

  // === Tier 2: Moderately Stable (External APIs with Good Reliability) ===
  exa: {
    name: "exa",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Neural search API with good reliability",
    priority: 1,
  },
  parallel: {
    name: "parallel",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Perplexity AI search API",
    priority: 2,
  },
  linkup: {
    name: "linkup",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "LinkUp search API",
    priority: 3,
  },
  socrata: {
    name: "socrata",
    tier: "tier2",
    requiresApiKey: false,
    requiresSelfHosted: false,
    description: "Open data portal aggregator",
    priority: 4,
  },
  groq: {
    name: "groq",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Ultra-fast AI inference (has rate limits)",
    priority: 5,
  },
  gemini: {
    name: "gemini",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Google AI (has daily quota limits)",
    priority: 6,
  },
  openrouter: {
    name: "openrouter",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Multi-model AI router",
    priority: 7,
  },

  // === Tier 3: Fallback (External APIs with Rate Limits or Reliability Issues) ===
  serper: {
    name: "serper",
    tier: "tier3",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Google Search API (insufficient credits)",
    priority: 1,
  },
  firecrawl: {
    name: "firecrawl",
    tier: "tier3",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Web scraping API (timeout issues)",
    priority: 2,
  },
  olostep: {
    name: "olostep",
    tier: "tier3",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Web scraping API (timeout issues)",
    priority: 3,
  },
  jina: {
    name: "jina",
    tier: "tier3",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "AI reader/writer API (insufficient balance)",
    priority: 4,
  },
  you: {
    name: "you",
    tier: "tier3",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "You.com search API (403 errors)",
    priority: 5,
  },
  deepseek: {
    name: "deepseek",
    tier: "tier3",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "DeepSeek AI API (insufficient balance)",
    priority: 6,
  },
  cloudflareWorker: {
    name: "cloudflareWorker",
    tier: "tier3",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Cloudflare Workers AI (authentication errors)",
    priority: 7,
  },
  langsearch: {
    name: "langsearch",
    tier: "tier3",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "LangSearch API",
    priority: 8,
  },
  websearch: {
    name: "websearch",
    tier: "tier3",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Generic web search API",
    priority: 9,
  },

  // === Tier 2/3: Other AI/Vector Providers ===
  cerebras: {
    name: "cerebras",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Cerebras AI inference",
    priority: 10,
  },
  cohere: {
    name: "cohere",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Cohere AI API",
    priority: 11,
  },
  minimax: {
    name: "minimax",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "MiniMax AI API",
    priority: 12,
  },
  mistral: {
    name: "mistral",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Mistral AI API",
    priority: 13,
  },
  nvidia: {
    name: "nvidia",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "NVIDIA AI API",
    priority: 14,
  },
  huggingFace: {
    name: "huggingFace",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Hugging Face API",
    priority: 15,
  },
  voyage: {
    name: "voyage",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Voyage AI embeddings",
    priority: 16,
  },
  pinecone: {
    name: "pinecone",
    tier: "tier2",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Pinecone vector database",
    priority: 17,
  },
  qdrant: {
    name: "qdrant",
    tier: "tier1",
    requiresApiKey: false,
    requiresSelfHosted: true,
    description: "Qdrant vector database (self-hosted)",
    priority: 18,
  },

  // === Disabled: Not Recommended for Production ===
  bidnet: {
    name: "bidnet",
    tier: "disabled",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "BidNet marketplace (limited coverage)",
    priority: 0,
  },
  browseAi: {
    name: "browseAi",
    tier: "disabled",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "BrowseAI (deprecated)",
    priority: 0,
  },
  browserUse: {
    name: "browserUse",
    tier: "disabled",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "BrowserUse (deprecated)",
    priority: 0,
  },
  clod: {
    name: "clod",
    tier: "disabled",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "CLōD (experimental)",
    priority: 0,
  },
  eunaBonfire: {
    name: "eunaBonfire",
    tier: "disabled",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "EUNA Bonfire (limited coverage)",
    priority: 0,
  },
  internationalPublicPortals: {
    name: "internationalPublicPortals",
    tier: "disabled",
    requiresApiKey: false,
    requiresSelfHosted: false,
    description: "International portals (limited coverage)",
    priority: 0,
  },
  fal: {
    name: "fal",
    tier: "disabled",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "Fal AI (experimental)",
    priority: 0,
  },
  mongoDb: {
    name: "mongoDb",
    tier: "disabled",
    requiresApiKey: true,
    requiresSelfHosted: false,
    description: "MongoDB (not recommended)",
    priority: 0,
  },
  usaSpending: {
    name: "usaSpending",
    tier: "disabled",
    requiresApiKey: false,
    requiresSelfHosted: false,
    description: "USA Spending (historical data only)",
    priority: 0,
  },
  federalRegister: {
    name: "federalRegister",
    tier: "disabled",
    requiresApiKey: false,
    requiresSelfHosted: false,
    description: "Federal Register (not for opportunities)",
    priority: 0,
  },
};

/**
 * Get providers by tier
 */
export function getProvidersByTier(tier: ProviderTier): ProviderName[] {
  return Object.entries(PROVIDER_TIERS)
    .filter(([, config]) => config.tier === tier)
    .sort(([, a], [, b]) => a.priority - b.priority)
    .map(([name]) => name as ProviderName);
}

/**
 * Get provider tier configuration
 */
export function getProviderTier(provider: ProviderName): ProviderTierConfig {
  return PROVIDER_TIERS[provider];
}

/**
 * Check if provider is stable (Tier 1)
 */
export function isStableProvider(provider: ProviderName): boolean {
  return PROVIDER_TIERS[provider].tier === "tier1";
}

/**
 * Check if provider requires self-hosted infrastructure
 */
export function requiresSelfHosted(provider: ProviderName): boolean {
  return PROVIDER_TIERS[provider].requiresSelfHosted;
}

/**
 * Get recommended providers for a specific use case
 */
export function getRecommendedProviders(useCase: "discovery" | "enrichment" | "extraction" | "search"): ProviderName[] {
  const tier1Providers = getProvidersByTier("tier1");
  
  switch (useCase) {
    case "discovery": {
      const candidates: ProviderName[] = ["rssAggregator", "samGov", "publicPortalProviders", "grantsGov", "texasEsbd", "nyScr"];
      return candidates.filter(p => tier1Providers.includes(p));
    }
    case "enrichment": {
      const candidates: ProviderName[] = ["selfHostedCrawler", "texasEsbd", "nyScr"];
      return candidates.filter(p => tier1Providers.includes(p));
    }
    case "extraction": {
      const candidates: ProviderName[] = ["localLlm", "gemini", "groq"];
      return candidates.filter(p => tier1Providers.includes(p) || PROVIDER_TIERS[p as ProviderName].tier === "tier2");
    }
    case "search": {
      const candidates: ProviderName[] = ["selfHostedSearch", "rssAggregator", "exa", "parallel"];
      return candidates.filter(p => tier1Providers.includes(p) || PROVIDER_TIERS[p as ProviderName].tier === "tier2");
    }
    default:
      return tier1Providers;
  }
}
