/**
 * Unified Fetch Pipeline
 *
 * Aggregates opportunity records from all configured providers:
 *   - SAM.gov    → direct federal solicitations
 *   - Serper     → Google web search for RFPs on the open web
 *   - Tavily     → Deep AI research for procurement leads
 *   - Gemini     → Query generation + structured extraction from web results
 *   - Tango      → Direct source (stub — awaiting API endpoint confirmation)
 *   - BidNet     → State & local bids (stub — awaiting API access details)
 *
 * All results are normalized, deduplicated, scored, and persisted to the DB.
 */

import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

import { samGovProvider } from "../providers/samGov";
import { tangoProvider } from "../providers/tango";
import { bidnetProvider } from "../providers/bidnet";
import { youProvider } from "../providers/you";
import { langsearchProvider } from "../providers/langsearch";
import { websearchProvider } from "../providers/websearch";
import { normalizedToDbRecord } from "./normalization";
import { scoreOpportunities } from "./scoring";
import { webIntelligenceFetch } from "./webIntelligence";
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

  // ── SAM.gov ───────────────────────────────────────────────────────────────
  if (requestedProviders.includes("samGov")) {
    const providerErrors: string[] = [];
    let fetched = 0;
    try {
      const fetchResult = await samGovProvider.fetch({
        keywords: options.keywords,
        dateRange: options.dateRange,
        limit: 100,
      });
      allRecords.push(...fetchResult.records);
      fetched = fetchResult.records.length;
      providerErrors.push(...fetchResult.errors);
    } catch (err: any) {
      providerErrors.push(err.message ?? String(err));
    }
    result.providerResults.push({ provider: "samGov", fetched, errors: providerErrors });
    result.fetched += fetched;
  }

  // ── Direct Stub Providers (Tango, BidNet) ────────────────────────────────
  // These are scaffolded but not yet operational pending API access details.
  // We call them so errors surface correctly instead of silently doing nothing.
  const directStubs: Array<{ name: string; provider: typeof tangoProvider | typeof bidnetProvider }> = [
    { name: "tango", provider: tangoProvider },
    { name: "bidnet", provider: bidnetProvider },
  ];
  for (const { name, provider } of directStubs) {
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
  const webProviders = ["serper", "tavily", "gemini", "statePortals", "exa", "firecrawl", "you", "langsearch", "websearch", "groq", "openrouter", "minimax"];
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
    const useOpenrouterFetch = requestedProviders.includes("openrouter");

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

      // Report per-provider stats
      if (useSerper) {
        result.providerResults.push({
          provider: "serper",
          fetched: stats.serperResults,
          errors: errors.filter((e) => e.startsWith("Serper")),
        });
      }
      if (useTavily) {
        result.providerResults.push({
          provider: "tavily",
          fetched: stats.tavilyResults,
          errors: errors.filter((e) => e.startsWith("Tavily")),
        });
      }
      if (useGemini) {
        result.providerResults.push({
          provider: "gemini",
          fetched: stats.extracted,
          errors: errors.filter((e) => e.startsWith("Gemini")),
        });
      }
      if (useStatePortals) {
        result.providerResults.push({
          provider: "statePortals",
          fetched: stats.statePortalResults,
          errors: errors.filter((e) => e.startsWith("State Portals")),
        });
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

  // ── Persist to DB ──────────────────────────────────────────────────────────
  for (const { opportunity } of scored) {
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
  }

  return result;
}
