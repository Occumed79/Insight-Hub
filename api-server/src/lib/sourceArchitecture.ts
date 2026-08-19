export type InsightSourceRole =
  | "direct_source"
  | "browser_discovery"
  | "enrichment"
  | "ai_judge"
  | "retrieval"
  | "intelligence"
  | "legacy_disabled";

export interface InsightSourceDefinition {
  name: string;
  role: InsightSourceRole;
  active: boolean;
  purpose: string;
}

/** One authoritative ownership decision for every configured integration. */
export const INSIGHT_SOURCE_ARCHITECTURE: InsightSourceDefinition[] = [
  { name: "samGov", role: "direct_source", active: true, purpose: "Official structured U.S. federal opportunities" },
  { name: "tango", role: "direct_source", active: true, purpose: "Structured federal opportunity pool" },
  { name: "texasEsbd", role: "direct_source", active: true, purpose: "Texas official procurement compatibility source" },
  { name: "nyScr", role: "direct_source", active: true, purpose: "New York official procurement compatibility source" },

  { name: "you", role: "browser_discovery", active: true, purpose: "Daily-renewing web opportunity discovery with independent account failover" },
  { name: "browserbase", role: "browser_discovery", active: true, purpose: "Managed web search plus page-fetch fallback with independent account failover" },
  { name: "keenable", role: "browser_discovery", active: true, purpose: "Managed indexed web search and fetch" },
  { name: "exa", role: "browser_discovery", active: true, purpose: "Semantic web opportunity discovery with independent account failover" },
  { name: "langsearch", role: "browser_discovery", active: true, purpose: "Four-account web opportunity discovery pool" },
  { name: "parallel", role: "browser_discovery", active: true, purpose: "Web opportunity discovery fallback" },
  { name: "firecrawl", role: "browser_discovery", active: true, purpose: "Search fallback plus managed page extraction using a three-account pool" },
  { name: "linkup", role: "browser_discovery", active: true, purpose: "Domain-aware opportunity discovery fallback" },
  { name: "socrata", role: "browser_discovery", active: true, purpose: "Official public-data procurement discovery" },
  { name: "websearch", role: "browser_discovery", active: true, purpose: "Broad web opportunity discovery fallback" },

  { name: "jina", role: "enrichment", active: true, purpose: "First-choice renewable/keyless page text extraction; key raises Reader limits" },
  { name: "microlink", role: "enrichment", active: true, purpose: "Final tiny-daily page extraction fallback" },
  { name: "cohere", role: "enrichment", active: true, purpose: "Semantic reranking and analysis" },

  { name: "cerebras", role: "ai_judge", active: true, purpose: "Primary low-cost procurement judge" },
  { name: "groq", role: "ai_judge", active: true, purpose: "Fast procurement judge with independent account failover" },
  { name: "mistral", role: "ai_judge", active: true, purpose: "Procurement judge fallback" },
  { name: "nvidia", role: "ai_judge", active: true, purpose: "Finite hosted inference emergency fallback" },
  { name: "openrouter", role: "ai_judge", active: true, purpose: "Model-routing judge fallback with independent account failover" },
  { name: "gemini", role: "ai_judge", active: true, purpose: "Query generation and judge fallback with independent account failover" },
  { name: "deepseek", role: "ai_judge", active: true, purpose: "Procurement judge fallback" },
  { name: "minimax", role: "ai_judge", active: true, purpose: "Procurement judge fallback" },
  { name: "clod", role: "ai_judge", active: true, purpose: "Procurement judge fallback" },

  { name: "pinecone", role: "retrieval", active: true, purpose: "Vector retrieval memory" },
  { name: "qdrant", role: "retrieval", active: true, purpose: "Vector retrieval memory" },
  { name: "voyage", role: "retrieval", active: true, purpose: "Embedding provider" },
  { name: "huggingFace", role: "retrieval", active: true, purpose: "Model and embedding utility provider" },

  { name: "govcon", role: "intelligence", active: true, purpose: "Forecast and recompete/incumbent intelligence" },
  { name: "gnews", role: "intelligence", active: true, purpose: "Federal contractor and acquisition news" },
  { name: "rssAggregator", role: "intelligence", active: true, purpose: "Explicitly selected supplemental notices only" },
  { name: "emailNotifications", role: "intelligence", active: true, purpose: "Explicitly selected procurement-alert inbox" },
  { name: "grantsGov", role: "intelligence", active: true, purpose: "Federal grants intelligence; not open-RFP ingestion" },

  { name: "serper", role: "legacy_disabled", active: false, purpose: "Retired finite signup-credit search provider" },
  { name: "olostep", role: "legacy_disabled", active: false, purpose: "Retired finite/trial extraction provider" },
  { name: "scheduledCrawler", role: "legacy_disabled", active: false, purpose: "Removed from manual RFP ingestion" },
  { name: "selfHostedCrawler", role: "legacy_disabled", active: false, purpose: "Not used by manual opportunity discovery" },
  { name: "selfHostedSearch", role: "legacy_disabled", active: false, purpose: "Not used by manual opportunity discovery" },
  { name: "localLlm", role: "legacy_disabled", active: false, purpose: "Retired self-hosted model path; excluded from hardened extraction" },
  { name: "usaSpending", role: "legacy_disabled", active: false, purpose: "Award/history intelligence only; not open-RFP ingestion" },
  { name: "federalRegister", role: "legacy_disabled", active: false, purpose: "Policy/rule intelligence only; not opportunity ingestion" },
  { name: "publicPortalProviders", role: "legacy_disabled", active: false, purpose: "Legacy selection aliases into browser discovery" },
  { name: "eunaBonfire", role: "legacy_disabled", active: false, purpose: "Legacy selection aliases into browser discovery" },
  { name: "internationalPublicPortals", role: "legacy_disabled", active: false, purpose: "Legacy selection aliases into browser discovery" },
  { name: "bidnet", role: "legacy_disabled", active: false, purpose: "Direct endpoint is not implemented" },
  { name: "browseAi", role: "legacy_disabled", active: false, purpose: "Browser automation path disabled" },
  { name: "browserUse", role: "legacy_disabled", active: false, purpose: "Browser automation path disabled" },
  { name: "cloudflareWorker", role: "legacy_disabled", active: false, purpose: "Worker extraction path disabled after authentication failures" },
  { name: "mongoDb", role: "legacy_disabled", active: false, purpose: "Unused alternate database integration" },
  { name: "fal", role: "legacy_disabled", active: false, purpose: "Media/model utility; not procurement discovery" },
];

const SOURCE_BY_NAME = new Map(
  INSIGHT_SOURCE_ARCHITECTURE.map((source) => [source.name, source] as const),
);

export function sourceDefinition(name: string): InsightSourceDefinition | null {
  return SOURCE_BY_NAME.get(name) ?? null;
}

export function activeSourcesForRole(role: InsightSourceRole): string[] {
  return INSIGHT_SOURCE_ARCHITECTURE.filter(
    (source) => source.active && source.role === role,
  ).map((source) => source.name);
}

export function sourceAllowedForRoles(
  name: string,
  allowedRoles: readonly InsightSourceRole[],
): boolean {
  const source = sourceDefinition(name);
  return Boolean(source && source.active && allowedRoles.includes(source.role));
}

export function assertSourceAllowedForRoles(
  name: string,
  allowedRoles: readonly InsightSourceRole[],
): InsightSourceDefinition {
  const source = sourceDefinition(name);
  if (!source) throw new Error(`Source ${name} is not registered in the Insight Hub source architecture.`);
  if (!source.active || source.role === "legacy_disabled") {
    throw new Error(`Source ${name} is disabled by the Insight Hub source architecture.`);
  }
  if (!allowedRoles.includes(source.role)) {
    throw new Error(`Source ${name} is owned by role ${source.role}; allowed roles are ${allowedRoles.join(", ")}.`);
  }
  return source;
}

export function validateSourceArchitecture(): string[] {
  const errors: string[] = [];
  const seen = new Map<string, InsightSourceDefinition>();
  for (const source of INSIGHT_SOURCE_ARCHITECTURE) {
    const previous = seen.get(source.name);
    if (previous) errors.push(`Duplicate source ownership for ${source.name}: ${previous.role} and ${source.role}`);
    seen.set(source.name, source);
    if (source.role === "legacy_disabled" && source.active) {
      errors.push(`Legacy-disabled source ${source.name} cannot be active.`);
    }
  }
  return errors;
}
