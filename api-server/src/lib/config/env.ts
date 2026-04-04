/**
 * Central environment variable management.
 * All provider credentials are read from here.
 */

export const env = {
  // SAM.gov
  SAM_GOV_API_KEY: process.env.SAM_GOV_API_KEY,
  SAM_GOV_BASE_URL: process.env.SAM_GOV_BASE_URL || "https://api.sam.gov/opportunities/v2/search",

  // Gemini AI
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  // Serper (Google Search API)
  SERPER_API_KEY: process.env.SERPER_API_KEY,

  // Tavily Research API
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,

  // Tango Procurement Intelligence
  TANGO_API_KEY: process.env.TANGO_API_KEY,

  // BidNet Direct
  BIDNET_API_KEY: process.env.BIDNET_API_KEY,
  BIDNET_BASE_URL: process.env.BIDNET_BASE_URL,
} as const;

export type EnvKey = keyof typeof env;
