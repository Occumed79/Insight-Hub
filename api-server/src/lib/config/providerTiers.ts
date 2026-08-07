/**
 * Provider Tier Configuration
 *
 * This registry describes reliability/cost posture only. Runtime ownership is
 * defined by sourceArchitecture.ts. In particular, self-hosted crawler/search
 * and legacy portal bundles are disabled for manual opportunity discovery.
 */

import type { ProviderName } from "./providerConfig";

export type ProviderTier = "tier1" | "tier2" | "tier3" | "disabled";

export interface ProviderTierConfig {
  name: ProviderName;
  tier: ProviderTier;
  requiresApiKey: boolean;
  requiresSelfHosted: boolean;
  description: string;
  priority: number;
}

function config(
  name: ProviderName,
  tier: ProviderTier,
  requiresApiKey: boolean,
  requiresSelfHosted: boolean,
  description: string,
  priority: number,
): ProviderTierConfig {
  return {
    name,
    tier,
    requiresApiKey,
    requiresSelfHosted,
    description,
    priority,
  };
}

export const PROVIDER_TIERS: Record<ProviderName, ProviderTierConfig> = {
  // Direct / stable structured sources and explicit intelligence inputs.
  samGov: config(
    "samGov",
    "tier1",
    false,
    false,
    "Official federal government procurement source",
    1,
  ),
  tango: config(
    "tango",
    "tier1",
    true,
    false,
    "Structured federal procurement source; paired with SAM in manual fetches",
    2,
  ),
  texasEsbd: config(
    "texasEsbd",
    "tier1",
    false,
    false,
    "Texas official procurement source retained for direct-source compatibility",
    3,
  ),
  nyScr: config(
    "nyScr",
    "tier1",
    false,
    false,
    "New York official procurement source retained for direct-source compatibility",
    4,
  ),
  rssAggregator: config(
    "rssAggregator",
    "tier1",
    false,
    false,
    "Explicit supplemental government RSS intelligence input",
    5,
  ),
  grantsGov: config(
    "grantsGov",
    "tier1",
    false,
    false,
    "Federal grants intelligence; not an open-RFP source",
    6,
  ),
  emailNotifications: config(
    "emailNotifications",
    "tier1",
    false,
    false,
    "Explicit procurement-alert inbox input",
    7,
  ),

  // Browser/search discovery APIs. Durable budget logic decides which limited
  // providers are actually spent on a given run.
  langsearch: config(
    "langsearch",
    "tier2",
    true,
    false,
    "LLM-oriented web search with three independently budgeted key slots",
    1,
  ),
  exa: config(
    "exa",
    "tier2",
    true,
    false,
    "Semantic web discovery API",
    2,
  ),
  parallel: config(
    "parallel",
    "tier2",
    true,
    false,
    "Web discovery API",
    3,
  ),
  linkup: config(
    "linkup",
    "tier2",
    true,
    false,
    "Domain-aware web discovery API",
    4,
  ),
  socrata: config(
    "socrata",
    "tier2",
    true,
    false,
    "Tyler/Socrata public-data procurement discovery",
    5,
  ),
  serper: config(
    "serper",
    "tier3",
    true,
    false,
    "Google search API with limited allowance",
    1,
  ),
  you: config(
    "you",
    "tier3",
    true,
    false,
    "Web search fallback with limited allowance",
    2,
  ),
  websearch: config(
    "websearch",
    "tier3",
    true,
    false,
    "Broad web search fallback",
    3,
  ),

  // Managed enrichment/extraction services. They enrich URLs discovered by the
  // search layer; they do not own manual opportunity discovery.
  jina: config(
    "jina",
    "tier2",
    true,
    false,
    "Managed page reader/enrichment service",
    10,
  ),
  olostep: config(
    "olostep",
    "tier3",
    true,
    false,
    "Managed difficult-page extraction fallback",
    10,
  ),
  firecrawl: config(
    "firecrawl",
    "tier3",
    true,
    false,
    "Managed page extraction fallback when explicitly enabled",
    11,
  ),

  // AI judges / analysis providers.
  cerebras: config(
    "cerebras",
    "tier2",
    true,
    false,
    "Fast procurement relevance judge",
    20,
  ),
  groq: config(
    "groq",
    "tier2",
    true,
    false,
    "Fast procurement relevance judge",
    21,
  ),
  mistral: config(
    "mistral",
    "tier2",
    true,
    false,
    "Procurement judge fallback",
    22,
  ),
  nvidia: config(
    "nvidia",
    "tier2",
    true,
    false,
    "Procurement judge fallback",
    23,
  ),
  openrouter: config(
    "openrouter",
    "tier2",
    true,
    false,
    "Model-routing procurement judge fallback",
    24,
  ),
  gemini: config(
    "gemini",
    "tier2",
    true,
    false,
    "Query generation and procurement judge fallback",
    25,
  ),
  minimax: config(
    "minimax",
    "tier2",
    true,
    false,
    "Procurement judge fallback",
    26,
  ),
  deepseek: config(
    "deepseek",
    "tier3",
    true,
    false,
    "Procurement judge fallback",
    27,
  ),
  clod: config(
    "clod",
    "tier3",
    true,
    false,
    "Experimental procurement judge fallback",
    28,
  ),
  cohere: config(
    "cohere",
    "tier2",
    true,
    false,
    "Semantic reranking / analysis",
    29,
  ),
  localLlm: config(
    "localLlm",
    "disabled",
    false,
    true,
    "Local/self-hosted model path is not part of the hardened manual workflow",
    0,
  ),

  // Retrieval/vector infrastructure.
  pinecone: config(
    "pinecone",
    "tier2",
    true,
    false,
    "Vector retrieval memory",
    30,
  ),
  qdrant: config(
    "qdrant",
    "tier2",
    true,
    false,
    "Vector retrieval memory",
    31,
  ),
  voyage: config(
    "voyage",
    "tier2",
    true,
    false,
    "Embedding provider",
    32,
  ),
  huggingFace: config(
    "huggingFace",
    "tier2",
    true,
    false,
    "Model/embedding utility provider",
    33,
  ),

  // Non-RFP intelligence or unsupported/legacy paths.
  usaSpending: config(
    "usaSpending",
    "disabled",
    false,
    false,
    "Award/history intelligence only; not open-RFP ingestion",
    0,
  ),
  federalRegister: config(
    "federalRegister",
    "disabled",
    false,
    false,
    "Policy/rule intelligence only; not opportunity ingestion",
    0,
  ),
  publicPortalProviders: config(
    "publicPortalProviders",
    "disabled",
    false,
    false,
    "Legacy portal bundle; manual selections collapse into browser discovery",
    0,
  ),
  eunaBonfire: config(
    "eunaBonfire",
    "disabled",
    false,
    false,
    "Legacy Euna/Bonfire discovery alias; not a direct feed",
    0,
  ),
  internationalPublicPortals: config(
    "internationalPublicPortals",
    "disabled",
    false,
    false,
    "Legacy international portal discovery alias",
    0,
  ),
  selfHostedCrawler: config(
    "selfHostedCrawler",
    "disabled",
    false,
    true,
    "Self-hosted crawler disabled for hardened manual opportunity discovery",
    0,
  ),
  selfHostedSearch: config(
    "selfHostedSearch",
    "disabled",
    false,
    true,
    "Self-hosted search disabled for hardened manual opportunity discovery",
    0,
  ),
  bidnet: config(
    "bidnet",
    "disabled",
    true,
    false,
    "BidNet direct endpoint is not implemented",
    0,
  ),
  browseAi: config(
    "browseAi",
    "disabled",
    true,
    false,
    "Browser automation path disabled",
    0,
  ),
  browserUse: config(
    "browserUse",
    "disabled",
    true,
    false,
    "Browser automation path disabled",
    0,
  ),
  cloudflareWorker: config(
    "cloudflareWorker",
    "disabled",
    true,
    false,
    "Cloudflare Worker extraction path disabled after authentication failures",
    0,
  ),
  mongoDb: config(
    "mongoDb",
    "disabled",
    true,
    false,
    "Unused alternate database integration",
    0,
  ),
  fal: config(
    "fal",
    "disabled",
    true,
    false,
    "Media/model utility; not procurement discovery",
    0,
  ),
};

export function getProvidersByTier(tier: ProviderTier): ProviderName[] {
  return Object.entries(PROVIDER_TIERS)
    .filter(([, value]) => value.tier === tier)
    .sort(([, left], [, right]) => left.priority - right.priority)
    .map(([name]) => name as ProviderName);
}

export function getProviderTier(provider: ProviderName): ProviderTierConfig {
  return PROVIDER_TIERS[provider];
}

export function isStableProvider(provider: ProviderName): boolean {
  return PROVIDER_TIERS[provider].tier === "tier1";
}

export function requiresSelfHosted(provider: ProviderName): boolean {
  return PROVIDER_TIERS[provider].requiresSelfHosted;
}

/**
 * Legacy callers receive recommendations that match the hardened ownership
 * model. Runtime budget selection may further narrow these lists.
 */
export function getRecommendedProviders(
  useCase: "discovery" | "enrichment" | "extraction" | "search",
): ProviderName[] {
  switch (useCase) {
    case "discovery":
      return [
        "samGov",
        "tango",
        "langsearch",
        "exa",
        "parallel",
        "linkup",
        "socrata",
      ];
    case "enrichment":
      return ["jina", "olostep", "firecrawl"];
    case "extraction":
      return ["cerebras", "groq", "mistral", "nvidia", "openrouter"];
    case "search":
      return ["langsearch", "serper", "exa", "parallel", "linkup", "you"];
  }
}
