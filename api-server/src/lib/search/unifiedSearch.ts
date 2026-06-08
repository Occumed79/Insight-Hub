/**
 * Unified Fetch Pipeline
 *
 * Aggregates opportunity records from all configured providers, normalizes,
 * deduplicates, scores, persists to the DB, and optionally writes vectors to
 * Qdrant/Pinecone for future similarity retrieval.
 */

import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

import { samGovProvider } from "../providers/samGov";
import { tangoProvider } from "../providers/tango";
import { bidnetProvider } from "../providers/bidnet";
import { grantsGovProvider } from "../providers/grantsGov";
import { usaSpendingProvider } from "../providers/usaSpending";
import { federalRegisterProvider } from "../providers/federalRegister";
import { cloudflareWorkerProvider } from "../providers/cloudflareWorker";
import { normalizedToDbRecord } from "./normalization";
import { scoreOpportunities } from "./scoring";
import { webIntelligenceFetch } from "./webIntelligence";
import { passesQualityFilter, hostFromUrl } from "./relevance";
import { indexOpportunities } from "./vectorIndex";
import type { NormalizedOpportunity } from "../providers/types";

export interface UnifiedFetchOptions {
  keywords?: string;
  dateRange?: number;
  providers?: string[];
  deduplicate?: boolean;
}

export interface UnifiedFetchResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  providerResults: {
    provider: string;
    fetched: number;
    errors: string[];
  }[];
}

export async function unifiedFetch(options: UnifiedFetchOptions = {}): Promise<UnifiedFetchResult> {
  const requestedProviders = options.providers ?? ["samGov"];

  const result: UnifiedFetchResult = {
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    providerResults: [],
  };

  const allRecords: NormalizedOpportunity[] = [];

  const runProvider = async (name: string, provider: { fetch: (options: any) => Promise<{ records: NormalizedOpportunity[]; errors?: string[] }> }) => {
    if (!requestedProviders.includes(name)) return;
    const providerErrors: string[] = [];
    let fetched = 0;
    try {
      const fetchResult = await provider.fetch({
        keywords: options.keywords,
        dateRange: options.dateRange,
        limit: 100,
      });
      allRecords.push(...fetchResult.records);
      fetched = fetchResult.records.length;
      providerErrors.push(...(fetchResult.errors ?? []));
    } catch (err: any) {
      providerErrors.push(err.message ?? String(err));
    }
    result.providerResults.push({ provider: name, fetched, errors: providerErrors });
    result.fetched += fetched;
  };

  // ── Public/direct sources ──────────────────────────────────────────────────
  await runProvider("samGov", samGovProvider);
  await runProvider("grantsGov", grantsGovProvider);
  await runProvider("usaSpending", usaSpendingProvider);
  await runProvider("federalRegister", federalRegisterProvider);
  await runProvider("cloudflareWorker", cloudflareWorkerProvider);

  // ── Direct Stub Providers (Tango, BidNet) ────────────────────────────────
  // These are scaffolded but not yet operational pending API access details.
  for (const { name, provider } of [
    { name: "tango", provider: tangoProvider },
    { name: "bidnet", provider: bidnetProvider },
  ]) {
    if (!requestedProviders.includes(name)) continue;
    try {
      const fetchResult = await provider.fetch({
        keywords: options.keywords,
        dateRange: options.dateRange,
      });
      allRecords.push(...fetchResult.records);
      result.fetched += fetchResult.records.length;
      result.providerResults.push({ provider: name, fetched: fetchResult.records.length, errors: fetchResult.errors ?? [] });
    } catch (err: any) {
      result.providerResults.push({ provider: name, fetched: 0, errors: [err.message ?? String(err)] });
    }
  }

  // ── Web Intelligence (Serper + Exa + Tavily + Gemini + FireCrawl + State Portals) ──
  const webProviders = ["serper", "tavily", "gemini", "statePortals", "exa", "firecrawl", "you", "langsearch", "websearch", "groq", "openrouter", "minimax", "cerebras", "deepseek", "mistral", "nvidia"];
  const useWebIntel = requestedProviders.some((p) => webProviders.includes(p));

  if (useWebIntel) {
    const useSerper = requestedProviders.includes("serper");
    const useTavily = requestedProviders.includes("tavily");
    const useGemini = requestedProviders.includes("gemini");
    const useStatePortals = requestedProviders.includes("statePortals");
    const useExa = requestedProviders.includes("exa");
    const useFirecrawl = requestedProviders.includes("firecrawl");
    const useYou = requestedProviders.includes("you");
    const useLangsearch = requestedProviders.includes("langsearch");
    const useWebsearch = requestedProviders.includes("websearch");
    const useGroqFetch = requestedProviders.includes("groq");
    const useOpenrouterFetch = requestedProviders.includes("openrouter") || requestedProviders.includes("cerebras") || requestedProviders.includes("deepseek") || requestedProviders.includes("mistral") || requestedProviders.includes("nvidia");

    try {
      const webResult = await webIntelligenceFetch({
        keywords: options.keywords,
        useSerper,
        useTavily,
        useGemini,
        useStatePortals,
        useExa,
        useFirecrawl,
        useYou,
        useLangsearch,
        useWebsearch,
        useGroqFetch,
        useOpenrouterFetch,
      });

      allRecords.push(...webResult.opportunities);

      const { stats, errors } = webResult;
      if (useSerper) result.providerResults.push({ provider: "serper", fetched: stats.serperResults, errors: errors.filter((e) => e.startsWith("Serper")) });
      if (useTavily) result.providerResults.push({ provider: "tavily", fetched: stats.tavilyResults, errors: errors.filter((e) => e.startsWith("Tavily")) });
      if (useGemini) result.providerResults.push({ provider: "gemini", fetched: stats.extracted, errors: errors.filter((e) => e.startsWith("Gemini")) });
      if (useStatePortals) result.providerResults.push({ provider: "statePortals", fetched: stats.statePortalResults, errors: errors.filter((e) => e.startsWith("State Portals")) });
      for (const aiName of ["cerebras", "deepseek", "mistral", "nvidia"]) {
        if (requestedProviders.includes(aiName)) result.providerResults.push({ provider: aiName, fetched: stats.extracted, errors: errors.filter((e) => e.includes(aiName)) });
      }

      result.fetched += webResult.opportunities.length;
    } catch (err: any) {
      const msg = err.message ?? String(err);
      for (const p of requestedProviders.filter((p) => webProviders.includes(p))) {
        result.providerResults.push({ provider: p, fetched: 0, errors: [msg] });
      }
    }
  }

  // ── Score and deduplicate ──────────────────────────────────────────────────
  const scored = scoreOpportunities(allRecords, {
    keywords: options.keywords ? options.keywords.split(/[\s,]+/).filter(Boolean) : [],
    naicsCodes: ["621111", "621999", "621512", "621310"],
  });

  // ── Quality filter (shared with the read-time list filter) ──────────────────
  const qualityFiltered = scored.filter(({ opportunity }) =>
    passesQualityFilter({
      title: opportunity.title,
      description: [opportunity.description, opportunity.agency].filter(Boolean).join(" "),
      sourceUrl: opportunity.sourceUrl,
    })
  );
  result.skipped += scored.length - qualityFiltered.length;

  // ── Cross-provider deduplication ────────────────────────────────────────────
  const seenKeys = new Set<string>();
  const deduped = qualityFiltered.filter(({ opportunity }) => {
    const keys = dedupeKeys(opportunity);
    if (keys.some((k) => seenKeys.has(k))) {
      result.skipped++;
      return false;
    }
    keys.forEach((k) => seenKeys.add(k));
    return true;
  });

  const persistedForIndex: NormalizedOpportunity[] = [];
  for (const { opportunity } of deduped) {
    const externalId = opportunity.externalId;

    if (externalId) {
      const existing = await db
        .select({ id: opportunitiesTable.id })
        .from(opportunitiesTable)
        .where(eq(opportunitiesTable.noticeId, externalId));

      if (existing.length > 0) {
        const dbRecord = normalizedToDbRecord(opportunity);
        await db
          .update(opportunitiesTable)
          .set({ ...dbRecord, updatedAt: new Date() })
          .where(eq(opportunitiesTable.id, existing[0].id));
        result.updated++;
        persistedForIndex.push(opportunity);
        continue;
      }
    }

    const dbRecord = normalizedToDbRecord(opportunity);
    await db.insert(opportunitiesTable).values({
      ...dbRecord,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    result.created++;
    persistedForIndex.push(opportunity);
  }

  const vectorStats = await indexOpportunities(persistedForIndex);
  if (vectorStats.errors.length > 0) {
    result.providerResults.push({
      provider: vectorStats.vectorStore ?? "vectorIndex",
      fetched: vectorStats.indexed,
      errors: vectorStats.errors,
    });
  } else if (vectorStats.indexed > 0) {
    result.providerResults.push({
      provider: `${vectorStats.vectorStore}:${vectorStats.provider}`,
      fetched: vectorStats.indexed,
      errors: [],
    });
  }

  return result;
}

function dedupeKeys(opp: NormalizedOpportunity): string[] {
  const keys: string[] = [];
  if (opp.externalId) keys.push(`id:${opp.externalId.toLowerCase()}`);
  if (opp.solicitationNumber) {
    const sol = opp.solicitationNumber.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (sol.length >= 4) keys.push(`sol:${sol}`);
  }
  const host = hostFromUrl(opp.sourceUrl);
  if (opp.sourceUrl) {
    try {
      const u = new URL(opp.sourceUrl.startsWith("http") ? opp.sourceUrl : `https://${opp.sourceUrl}`);
      keys.push(`url:${(u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "")).toLowerCase()}`);
    } catch {
      keys.push(`url:${opp.sourceUrl.toLowerCase()}`);
    }
  }
  const normTitle = opp.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  if (normTitle.length >= 8) keys.push(`title:${normTitle}|${host ?? (opp.agency ?? "").toLowerCase()}`);
  return keys;
}
