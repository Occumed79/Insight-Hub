export * from "./types";
export * from "./samGov";
export * from "./texasEsbd";
export * from "./nyScr";
export * from "./usaSpending";
export * from "./federalRegister";
export * from "./publicPortalProviders";
export * from "./crawlerAugmentedPublicPortalProvider";
export * from "./auditedPublicPortalProvider";
export * from "./productionPublicPortalProvider";
export * from "./providerQueryMatch";
export * from "./fairOpportunityMerge";
export * from "./publicPortalDiscovery";
export * from "./eunaBonfire";
export * from "./disabledEunaDiscoveryProvider";
export * from "./internationalPublicPortals";
export * from "./gemini";
export * from "./tango";
export * from "./bidnet";
export * from "./firecrawl";
export * from "./browserbase";
export * from "./keenable";
export * from "./microlink";
export * from "./jina";
export * from "./openrouter";
export * from "./groq";
export * from "./exa";
export * from "./browseAi";
export * from "./browserUse";
export * from "./parallel";
export * from "./linkup";
export * from "./socrata";
export * from "./clod";
export * from "./openAiCompatible";
export * from "./cohere";
export * from "./voyage";
export * from "./huggingFace";
export * from "./qdrant";
export * from "./pinecone";
export * from "./cloudflareWorker";
export * from "./configOnly";
export * from "./selfHostedCrawler";
export * from "./rssAggregator";
export * from "./selfHostedSearch";
export * from "./emailNotifications";

import "./manualCrawlerRegistration";
import { samGovProvider } from "./samGov";
import { texasEsbdProvider } from "./texasEsbd";
import { nyScrProvider } from "./nyScr";
import { usaSpendingProvider } from "./usaSpending";
import { federalRegisterProvider } from "./federalRegister";
import { productionPublicPortalProvider } from "./productionPublicPortalProvider";
import { disabledEunaDiscoveryProvider } from "./disabledEunaDiscoveryProvider";
import { internationalPublicPortalsProvider } from "./internationalPublicPortals";
import { geminiProvider } from "./gemini";
import { tangoProvider } from "./tango";
import { bidnetProvider } from "./bidnet";
import { firecrawlProvider } from "./firecrawl";
import { browserbaseProvider } from "./browserbase";
import { keenableProvider } from "./keenable";
import { microlinkProvider } from "./microlink";
import { jinaProvider } from "./jina";
import { openrouterProvider } from "./openrouter";
import { groqProvider } from "./groq";
import { exaProvider } from "./exa";
import { browseAiProvider } from "./browseAi";
import { browserUseProvider } from "./browserUse";
import { parallelProvider } from "./parallel";
import { linkupProvider } from "./linkup";
import { socrataProvider } from "./socrata";
import { clodProvider } from "./clod";
import { minimaxProvider } from "./minimax";
import { youProvider } from "./you";
import { langsearchProvider } from "./langsearch";
import { websearchProvider } from "./websearch";
import { grantsGovProvider } from "./grantsGov";
import {
  cerebrasProvider,
  deepseekProvider,
  mistralProvider,
  nvidiaProvider,
} from "./openAiCompatible";
import { cohereProvider } from "./cohere";
import { voyageProvider } from "./voyage";
import { huggingFaceProvider } from "./huggingFace";
import { qdrantProvider } from "./qdrant";
import { pineconeProvider } from "./pinecone";
import { cloudflareWorkerProvider } from "./cloudflareWorker";
import {
  falProvider,
  mongoDbProvider,
  retiredLocalLlmProvider,
} from "./configOnly";
import { selfHostedCrawlerProvider } from "./selfHostedCrawler";
import { rssAggregatorProvider } from "./rssAggregator";
import { selfHostedSearchProvider } from "./selfHostedSearch";
import { emailNotificationProvider } from "./emailNotifications";
import type { DataSourceProvider } from "./types";
import type { ProviderName } from "../config/providerConfig";

export const providerRegistry: Record<ProviderName, DataSourceProvider> = {
  samGov: samGovProvider,
  texasEsbd: texasEsbdProvider,
  nyScr: nyScrProvider,
  publicPortalProviders: productionPublicPortalProvider,
  eunaBonfire: disabledEunaDiscoveryProvider,
  internationalPublicPortals: internationalPublicPortalsProvider,
  usaSpending: usaSpendingProvider,
  federalRegister: federalRegisterProvider,
  gemini: geminiProvider,
  tango: tangoProvider,
  bidnet: bidnetProvider,
  firecrawl: firecrawlProvider,
  browserbase: browserbaseProvider,
  keenable: keenableProvider,
  microlink: microlinkProvider,
  jina: jinaProvider,
  openrouter: openrouterProvider,
  groq: groqProvider,
  exa: exaProvider,
  browseAi: browseAiProvider,
  browserUse: browserUseProvider,
  parallel: parallelProvider,
  linkup: linkupProvider,
  socrata: socrataProvider,
  clod: clodProvider,
  minimax: minimaxProvider,
  you: youProvider,
  langsearch: langsearchProvider,
  websearch: websearchProvider,
  grantsGov: grantsGovProvider,
  cerebras: cerebrasProvider,
  cohere: cohereProvider,
  deepseek: deepseekProvider,
  fal: falProvider,
  mistral: mistralProvider,
  nvidia: nvidiaProvider,
  pinecone: pineconeProvider,
  qdrant: qdrantProvider,
  cloudflareWorker: cloudflareWorkerProvider,
  mongoDb: mongoDbProvider,
  voyage: voyageProvider,
  huggingFace: huggingFaceProvider,
  selfHostedCrawler: selfHostedCrawlerProvider,
  rssAggregator: rssAggregatorProvider,
  localLlm: retiredLocalLlmProvider,
  selfHostedSearch: selfHostedSearchProvider,
  emailNotifications: emailNotificationProvider,
};

export function getProvider(name: ProviderName): DataSourceProvider {
  const provider = providerRegistry[name];
  if (!provider) throw new Error(`Unknown provider: ${name}`);
  return provider;
}
