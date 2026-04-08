export * from "./types";
export * from "./samGov";
export * from "./gemini";
export * from "./serper";
export * from "./tavily";
export * from "./tango";
export * from "./bidnet";
export * from "./statePortals";
export * from "./firecrawl";
export * from "./openrouter";
export * from "./groq";
export * from "./exa";
export * from "./browseAi";
export * from "./browserUse";
export * from "./olostep";
export * from "./clod";

import { samGovProvider } from "./samGov";
import { geminiProvider } from "./gemini";
import { serperProvider } from "./serper";
import { tavilyProvider } from "./tavily";
import { tangoProvider } from "./tango";
import { bidnetProvider } from "./bidnet";
import { statePortalsProvider } from "./statePortals";
import { firecrawlProvider } from "./firecrawl";
import { openrouterProvider } from "./openrouter";
import { groqProvider } from "./groq";
import { exaProvider } from "./exa";
import { browseAiProvider } from "./browseAi";
import { browserUseProvider } from "./browserUse";
import { olostepProvider } from "./olostep";
import { clodProvider } from "./clod";
import type { DataSourceProvider } from "./types";
import type { ProviderName } from "../config/providerConfig";

/**
 * Central registry of all data source providers.
 */
export const providerRegistry: Record<ProviderName, DataSourceProvider> = {
  samGov: samGovProvider,
  gemini: geminiProvider,
  serper: serperProvider,
  tavily: tavilyProvider,
  tango: tangoProvider,
  bidnet: bidnetProvider,
  statePortals: statePortalsProvider as unknown as DataSourceProvider,
  firecrawl: firecrawlProvider,
  openrouter: openrouterProvider,
  groq: groqProvider,
  exa: exaProvider,
  browseAi: browseAiProvider,
  browserUse: browserUseProvider,
  olostep: olostepProvider,
  clod: clodProvider,
};

export function getProvider(name: ProviderName): DataSourceProvider {
  const provider = providerRegistry[name];
  if (!provider) throw new Error(`Unknown provider: ${name}`);
  return provider;
}
