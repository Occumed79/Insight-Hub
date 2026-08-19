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
  return { name, tier, requiresApiKey, requiresSelfHosted, description, priority };
}

export const PROVIDER_TIERS: Record<ProviderName, ProviderTierConfig> = {
  samGov: config("samGov", "tier1", false, false, "Official federal government procurement source", 1),
  tango: config("tango", "tier1", true, false, "Independent structured federal procurement source", 2),
  texasEsbd: config("texasEsbd", "tier1", false, false, "Texas official procurement source retained for direct-source compatibility", 3),
  nyScr: config("nyScr", "tier1", false, false, "New York official procurement source retained for direct-source compatibility", 4),
  rssAggregator: config("rssAggregator", "tier1", false, false, "Explicit supplemental government RSS intelligence input", 5),
  grantsGov: config("grantsGov", "tier1", false, false, "Federal grants intelligence; not an open-RFP source", 6),
  emailNotifications: config("emailNotifications", "tier1", false, false, "Explicit procurement-alert inbox input", 7),

  // Search-provider tier is only a coarse compatibility classification. The
  // quota scheduler in discoveryQuotaPolicy.ts owns spend order at runtime.
  you: config("you", "tier2", true, false, "Daily-renewing web search with independent account failover", 1),
  langsearch: config("langsearch", "tier2", true, false, "LLM-oriented web search with four independently budgeted account slots", 2),
  exa: config("exa", "tier2", true, false, "Semantic web discovery with three independent account pools", 3),
  parallel: config("parallel", "tier2", true, false, "Monthly-renewable web discovery API", 4),
  firecrawl: config("firecrawl", "tier2", true, false, "Three-account search and managed page extraction fallback", 5),
  linkup: config("linkup", "tier2", true, false, "Domain-aware web discovery API", 6),
  socrata: config("socrata", "tier2", true, false, "Tyler/Socrata public-data procurement discovery", 7),
  websearch: config("websearch", "tier3", true, false, "Broad web search fallback", 8),
  serper: config("serper", "disabled", true, false, "Retired finite signup-credit search provider", 0),

  jina: config("jina", "tier2", false, false, "First-choice keyless page reader; optional key raises Reader rate limits", 10),
  olostep: config("olostep", "disabled", true, false, "Retired finite/trial page extraction provider", 0),

  cerebras: config("cerebras", "tier2", true, false, "Fast procurement relevance judge", 20),
  groq: config("groq", "tier2", true, false, "Fast procurement relevance judge with independent account failover", 21),
  mistral: config("mistral", "tier2", true, false, "Procurement judge fallback", 22),
  nvidia: config("nvidia", "tier2", true, false, "Finite hosted-inference emergency judge fallback", 23),
  openrouter: config("openrouter", "tier2", true, false, "Model-routing procurement judge fallback with independent account failover", 24),
  gemini: config("gemini", "tier2", true, false, "Query generation and procurement judge fallback with independent account failover", 25),
  minimax: config("minimax", "tier2", true, false, "Procurement judge fallback", 26),
  deepseek: config("deepseek", "tier3", true, false, "Procurement judge fallback", 27),
  clod: config("clod", "tier3", true, false, "Experimental procurement judge fallback", 28),
  cohere: config("cohere", "tier2", true, false, "Semantic reranking with four independent account fallbacks", 29),
  localLlm: config("localLlm", "disabled", false, true, "Local/self-hosted model path is not part of the hardened manual workflow", 0),

  pinecone: config("pinecone", "tier2", true, false, "Vector retrieval memory", 30),
  qdrant: config("qdrant", "tier2", true, false, "Vector retrieval memory", 31),
  voyage: config("voyage", "tier2", true, false, "Embedding provider", 32),
  huggingFace: config("huggingFace", "tier2", true, false, "Model/embedding utility provider", 33),

  usaSpending: config("usaSpending", "disabled", false, false, "Award/history intelligence only; not open-RFP ingestion", 0),
  federalRegister: config("federalRegister", "disabled", false, false, "Policy/rule intelligence only; not opportunity ingestion", 0),
  publicPortalProviders: config("publicPortalProviders", "disabled", false, false, "Legacy portal bundle; manual selections collapse into browser discovery", 0),
  eunaBonfire: config("eunaBonfire", "disabled", false, false, "Legacy Euna/Bonfire discovery alias; not a direct feed", 0),
  internationalPublicPortals: config("internationalPublicPortals", "disabled", false, false, "Legacy international portal discovery alias", 0),
  selfHostedCrawler: config("selfHostedCrawler", "disabled", false, true, "Self-hosted crawler disabled for hardened manual opportunity discovery", 0),
  selfHostedSearch: config("selfHostedSearch", "disabled", false, true, "Self-hosted search disabled for hardened manual opportunity discovery", 0),
  bidnet: config("bidnet", "disabled", true, false, "BidNet direct endpoint is not implemented", 0),
  browseAi: config("browseAi", "disabled", true, false, "Browser automation path disabled", 0),
  browserUse: config("browserUse", "disabled", true, false, "Browser automation path disabled", 0),
  cloudflareWorker: config("cloudflareWorker", "disabled", true, false, "Cloudflare Worker extraction path disabled after authentication failures", 0),
  mongoDb: config("mongoDb", "disabled", true, false, "Unused alternate database integration", 0),
  fal: config("fal", "disabled", true, false, "Media/model utility; not procurement discovery", 0),
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

/** Compatibility recommendations; runtime quota policy may narrow the list. */
export function getRecommendedProviders(
  useCase: "discovery" | "enrichment" | "extraction" | "search",
): ProviderName[] {
  switch (useCase) {
    case "discovery":
      return ["samGov", "tango", "you", "langsearch", "exa", "parallel", "firecrawl", "linkup", "socrata"];
    case "enrichment":
      return ["jina", "firecrawl"];
    case "extraction":
      return ["cerebras", "groq", "mistral", "nvidia", "openrouter", "gemini"];
    case "search":
      return ["you", "langsearch", "exa", "parallel", "firecrawl", "linkup", "websearch"];
  }
}
