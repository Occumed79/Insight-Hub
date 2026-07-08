export * from "./types";
export * from "./samGov";
export * from "./texasEsbd";
export * from "./gemini";
export * from "./serper";
export * from "./tavily";
export * from "./tango";
export * from "./bidnet";
export * from "./statePortals";
export * from "./firecrawl";
export * from "./jina";
export * from "./openrouter";
export * from "./groq";
export * from "./exa";
export * from "./browseAi";
export * from "./browserUse";
export * from "./olostep";
export * from "./clod";
export * from "./openAiCompatible";
export * from "./cohere";
export * from "./voyage";
export * from "./huggingFace";
export * from "./qdrant";
export * from "./pinecone";
export * from "./cloudflareWorker";
export * from "./configOnly";

import { samGovProvider } from "./samGov";
import { texasEsbdProvider } from "./texasEsbd";
import { geminiProvider } from "./gemini";
import { serperProvider } from "./serper";
import { tavilyProvider } from "./tavily";
import { tangoProvider } from "./tango";
import { bidnetProvider } from "./bidnet";
import { statePortalsProvider } from "./statePortals";
import { firecrawlProvider } from "./firecrawl";
import { jinaProvider } from "./jina";
import { openrouterProvider } from "./openrouter";
import { groqProvider } from "./groq";
import { exaProvider } from "./exa";
import { browseAiProvider } from "./browseAi";
import { browserUseProvider } from "./browserUse";
import { olostepProvider } from "./olostep";
import { clodProvider } from "./clod";
import { minimaxProvider } from "./minimax";
import { youProvider } from "./you";
import { langsearchProvider } from "./langsearch";
import { websearchProvider } from "./websearch";
import { grantsGovProvider } from "./grantsGov";
import { cerebrasProvider, deepseekProvider, mistralProvider, nvidiaProvider } from "./openAiCompatible";
import { cohereProvider } from "./cohere";
import { voyageProvider } from "./voyage";
import { huggingFaceProvider } from "./huggingFace";
import { qdrantProvider } from "./qdrant";
import { pineconeProvider } from "./pinecone";
import { cloudflareWorkerProvider } from "./cloudflareWorker";
import { falProvider, mongoDbProvider } from "./configOnly";
import type { DataSourceProvider } from "./types";
import type { ProviderName } from "../config/providerConfig";

export const providerRegistry: Record<ProviderName, DataSourceProvider> = {
  samGov: samGovProvider,
  texasEsbd: texasEsbdProvider as unknown as DataSourceProvider,
  gemini: geminiProvider,
  serper: serperProvider,
  tavily: tavilyProvider,
  tango: tangoProvider,
  bidnet: bidnetProvider,
  statePortals: statePortalsProvider as unknown as DataSourceProvider,
  firecrawl: firecrawlProvider,
  jina: jinaProvider,
  openrouter: openrouterProvider,
  groq: groqProvider,
  exa: exaProvider,
  browseAi: browseAiProvider,
  browserUse: browserUseProvider,
  olostep: olostepProvider,
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
};

export function getProvider(name: ProviderName): DataSourceProvider {
  const provider = providerRegistry[name];
  if (!provider) throw new Error(`Unknown provider: ${name}`);
  return provider;
}
