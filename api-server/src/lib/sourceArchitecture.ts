export type InsightSourceRole =
  | "direct_source"
  | "browser_discovery"
  | "enrichment"
  | "ai_judge"
  | "intelligence"
  | "legacy_disabled";

export interface InsightSourceDefinition {
  name: string;
  role: InsightSourceRole;
  active: boolean;
  purpose: string;
}

/**
 * Authoritative runtime ownership map. A provider belongs to one primary role;
 * this prevents the same integration from silently acting as a crawler, search
 * engine, judge, and direct procurement source in different code paths.
 */
export const INSIGHT_SOURCE_ARCHITECTURE: InsightSourceDefinition[] = [
  { name: "samGov", role: "direct_source", active: true, purpose: "Official structured U.S. federal opportunities" },
  { name: "tango", role: "direct_source", active: true, purpose: "Structured federal opportunity pool" },

  { name: "langsearch", role: "browser_discovery", active: true, purpose: "State/local/private web opportunity discovery" },
  { name: "serper", role: "browser_discovery", active: true, purpose: "Search-engine opportunity discovery" },
  { name: "exa", role: "browser_discovery", active: true, purpose: "Semantic web opportunity discovery" },
  { name: "parallel", role: "browser_discovery", active: true, purpose: "Web opportunity discovery fallback" },
  { name: "linkup", role: "browser_discovery", active: true, purpose: "Domain-aware opportunity discovery fallback" },
  { name: "you", role: "browser_discovery", active: true, purpose: "Web opportunity discovery fallback" },
  { name: "socrata", role: "browser_discovery", active: true, purpose: "Official public-data procurement discovery" },
  { name: "websearch", role: "browser_discovery", active: true, purpose: "Broad web opportunity discovery fallback" },

  { name: "jina", role: "enrichment", active: true, purpose: "Managed page text extraction" },
  { name: "olostep", role: "enrichment", active: true, purpose: "Managed difficult-page extraction" },
  { name: "firecrawl", role: "enrichment", active: true, purpose: "Managed page extraction when explicitly enabled" },

  { name: "cerebras", role: "ai_judge", active: true, purpose: "Primary low-cost procurement judge" },
  { name: "groq", role: "ai_judge", active: true, purpose: "Fast procurement judge" },
  { name: "mistral", role: "ai_judge", active: true, purpose: "Procurement judge fallback" },
  { name: "nvidia", role: "ai_judge", active: true, purpose: "Procurement judge fallback" },
  { name: "openrouter", role: "ai_judge", active: true, purpose: "Model-routing judge fallback" },
  { name: "gemini", role: "ai_judge", active: true, purpose: "Query generation and judge fallback" },
  { name: "deepseek", role: "ai_judge", active: true, purpose: "Procurement judge fallback" },
  { name: "minimax", role: "ai_judge", active: true, purpose: "Procurement judge fallback" },
  { name: "clod", role: "ai_judge", active: true, purpose: "Procurement judge fallback" },

  { name: "govcon", role: "intelligence", active: true, purpose: "Forecast and recompete/incumbent intelligence" },
  { name: "gnews", role: "intelligence", active: true, purpose: "Federal contractor and acquisition news" },
  { name: "rssAggregator", role: "intelligence", active: true, purpose: "Explicitly selected supplemental notices only" },
  { name: "emailNotifications", role: "intelligence", active: true, purpose: "Explicitly selected procurement-alert inbox" },

  { name: "scheduledCrawler", role: "legacy_disabled", active: false, purpose: "Removed from manual RFP ingestion" },
  { name: "selfHostedCrawler", role: "legacy_disabled", active: false, purpose: "Not used by manual opportunity discovery" },
  { name: "selfHostedSearch", role: "legacy_disabled", active: false, purpose: "Not used by manual opportunity discovery" },
  { name: "publicPortalProviders", role: "legacy_disabled", active: false, purpose: "Legacy selection aliases into browser discovery" },
  { name: "eunaBonfire", role: "legacy_disabled", active: false, purpose: "Legacy selection aliases into browser discovery" },
  { name: "internationalPublicPortals", role: "legacy_disabled", active: false, purpose: "Legacy selection aliases into browser discovery" },
];

export function activeSourcesForRole(role: InsightSourceRole): string[] {
  return INSIGHT_SOURCE_ARCHITECTURE.filter(
    (source) => source.active && source.role === role,
  ).map((source) => source.name);
}
