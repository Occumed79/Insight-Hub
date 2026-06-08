/**
 * Central environment variable management.
 * All provider credentials and feature flags are read from here.
 */

export const env = {
  // SAM.gov
  SAM_GOV_API_KEY: process.env.SAM_GOV_API_KEY,
  SAM_GOV_BASE_URL: process.env.SAM_GOV_BASE_URL || "https://api.sam.gov/opportunities/v2/search",

  // Federal Register
  FEDERAL_REGISTER_API_BASE: process.env.FEDERAL_REGISTER_API_BASE || "https://www.federalregister.gov/api/v1",

  // Gemini AI
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  // Additional AI / model providers
  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
  COHERE_API_KEY: process.env.COHERE_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  FAL_API_KEY: process.env.FAL_API_KEY,
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
  VOYAGE_API_KEY: process.env.VOYAGE_API_KEY,
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY,

  // Serper (Google Search API)
  SERPER_API_KEY: process.env.SERPER_API_KEY,

  // Tavily Research API
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,

  // Vector search / storage backends
  PINECONE_API_KEY: process.env.PINECONE_API_KEY,
  PINECONE_INDEX_HOST: process.env.PINECONE_INDEX_HOST,
  PINECONE_NAMESPACE: process.env.PINECONE_NAMESPACE,
  QDRANT_API_KEY: process.env.QDRANT_API_KEY,
  QDRANT_URL: process.env.QDRANT_URL,
  QDRANT_COLLECTION: process.env.QDRANT_COLLECTION,

  // Infrastructure connectors
  CLOUDFLARE_WORKER_API: process.env.CLOUDFLARE_WORKER_API,

  // Procurement source feature flags
  STATE_PROCUREMENT_SOURCES_ENABLED: process.env.STATE_PROCUREMENT_SOURCES_ENABLED,
  COUNTY_PROCUREMENT_SOURCES_ENABLED: process.env.COUNTY_PROCUREMENT_SOURCES_ENABLED,
  UNIVERSITY_BID_SOURCES_ENABLED: process.env.UNIVERSITY_BID_SOURCES_ENABLED,
  CITY_PROCUREMENT_SOURCES_ENABLED: process.env.CITY_PROCUREMENT_SOURCES_ENABLED,
  MUNICIPAL_PROCUREMENT_SOURCES_ENABLED: process.env.MUNICIPAL_PROCUREMENT_SOURCES_ENABLED,
  LOCAL_GOV_BID_SOURCES_ENABLED: process.env.LOCAL_GOV_BID_SOURCES_ENABLED,

  // Search / ranking feature flags
  ENABLE_SEMANTIC_RERANK: process.env.ENABLE_SEMANTIC_RERANK,

  // Tango Procurement Intelligence
  TANGO_API_KEY: process.env.TANGO_API_KEY,

  // BidNet Direct
  BIDNET_API_KEY: process.env.BIDNET_API_KEY,
  BIDNET_BASE_URL: process.env.BIDNET_BASE_URL,
} as const;

export type EnvKey = keyof typeof env;

export function envFlag(key: EnvKey, defaultValue = false): boolean {
  const value = env[key];
  if (value == null || value === "") return defaultValue;
  return /^(1|true|yes|on|enabled)$/i.test(String(value).trim());
}

export const procurementSourceFlags = {
  state: envFlag("STATE_PROCUREMENT_SOURCES_ENABLED", true),
  county: envFlag("COUNTY_PROCUREMENT_SOURCES_ENABLED", false),
  university: envFlag("UNIVERSITY_BID_SOURCES_ENABLED", false),
  city: envFlag("CITY_PROCUREMENT_SOURCES_ENABLED", false),
  municipal: envFlag("MUNICIPAL_PROCUREMENT_SOURCES_ENABLED", false),
  localGov: envFlag("LOCAL_GOV_BID_SOURCES_ENABLED", false),
} as const;

export function isAnyLocalProcurementSourceEnabled(): boolean {
  return procurementSourceFlags.county || procurementSourceFlags.city || procurementSourceFlags.municipal || procurementSourceFlags.localGov;
}
