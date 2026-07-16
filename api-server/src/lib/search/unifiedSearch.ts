/**
 * Unified Fetch Pipeline
 *
 * Aggregates RFP opportunity records from configured RFP providers, normalizes,
 * deduplicates, scores, persists to the RFP DB, and optionally writes vectors to
 * Qdrant/Pinecone for future similarity retrieval.
 */

import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

import { samGovProvider } from "../providers/samGov";
import { publicPortalProvidersProvider } from "../providers/publicPortalProviders";
import { eunaBonfireProvider } from "../providers/eunaBonfire";
import { internationalPublicPortalsProvider } from "../providers/internationalPublicPortals";
import { tangoProvider } from "../providers/tango";
import { bidnetProvider } from "../providers/bidnet";
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

const INTEL_ONLY_PROVIDERS = new Set(["usaSpending", "federalRegister", "grantsGov"]);
const PROVIDER_ALIASES = new Map([["statePortals", "publicPortalProviders"]]);

export async function unifiedFetch(options: UnifiedFetchOptions = {}): Promise<UnifiedFetchResult> {
  const requestedProviders = Array.from(new Set((options.providers ?? ["samGov"]).map((provider) => PROVIDER_ALIASES.get(provider) ?? provider))).filter((provider) => !INTEL_ONLY_PROVIDERS.has(provider));

  const result: UnifiedFetchResult = {
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    providerResults: [],
  };

  for (const provider of options.providers ?? []) {
    if (INTEL_ONLY_PROVIDERS.has(provider)) {
      result.providerResults.push({
        provider,
        fetched: 0,
        errors: ["Excluded from RFP ingestion. This source belongs in the intel database pipeline."],
      });
    }
  }

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

  // ── Public/direct RFP sources ────────────────────────────────────────────────
  await runProvider("samGov", samGovProvider);
  await runProvider("publicPortalProviders", publicPortalProvidersProvider);
  await runProvider("eunaBonfire", eunaBonfireProvider);
  await runProvider("internationalPublicPortals", internationalPublicPortalsProvider);
  await runProvider("tango", tangoProvider);

  // ── Direct Stub Providers (BidNet) ───────────────────────────────────────
  // These are scaffolded but not yet operational pending API access details.
  if (requestedProviders.includes("bidnet")) {
    try {
      const fetchResult = await bidnetProvider.fetch({
        keywords: options.keywords,
        dateRange: options.dateRange,
      });
      allRecords.push(...fetchResult.records);
      result.fetched += fetchResult.records.length;
      result.providerResults.push({ provider: "bidnet", fetched: fetchResult.records.length, errors: fetchResult.errors ?? [] });
    } catch (err: any) {
      result.providerResults.push({ provider: "bidnet", fetched: 0, errors: [err.message ?? String(err)] });
    }
  }

  // ── Web Intelligence (Serper + Exa + Tavily + Gemini + FireCrawl) ──
  const webProviders = ["serper", "tavily", "gemini", "exa", "firecrawl", "you", "langsearch", "websearch", "groq", "openrouter", "minimax", "cerebras", "deepseek", "mistral", "nvidia", "cloudflareWorker", "clod", "olostep"];
  const useWebIntel = requestedProviders.some((p) => webProviders.includes(p));

  if (useWebIntel) {
    const useSerper = requestedProviders.includes("serper");
    const useTavily = requestedProviders.includes("tavily");
    const useGemini = requestedProviders.includes("gemini");
    const useExa = requestedProviders.includes("exa");
    const useFirecrawl = requestedProviders.includes("firecrawl");
    const useYou = requestedProviders.includes("you");
    const useLangsearch = requestedProviders.includes("langsearch");
    const useWebsearch = requestedProviders.includes("websearch");
    const useGroqFetch = requestedProviders.includes("groq");
    const useOpenrouterFetch = requestedProviders.includes("openrouter") || requestedProviders.includes("cerebras") || requestedProviders.includes("deepseek") || requestedProviders.includes("mistral") || requestedProviders.includes("nvidia") || requestedProviders.includes("clod");

    try {
      const webResult = await webIntelligenceFetch({
        keywords: options.keywords,
        useSerper,
        useTavily,
        useGemini,
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
      for (const aiName of ["cerebras", "deepseek", "mistral", "nvidia", "clod"]) {
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
      // Use provider + externalId together for a scoped identity check.
      // This prevents a noticeId collision across unrelated providers and
      // ensures each provider's external IDs are treated as an independent
      // namespace.
      const sourceMap: Record<string, "sam_gov" | "csv_import" | "manual"> = {
        samGov: "sam_gov",
        texasEsbd: "csv_import",
        nyScr: "csv_import",
        statePortals: "csv_import",
        gemini: "manual",
        serper: "manual",
        tavily: "manual",
        tango: "manual",
        bidnet: "manual",
      };
      const mappedSource = sourceMap[opportunity.source] ?? "manual";

      const existing = await db
        .select({ id: opportunitiesTable.id })
        .from(opportunitiesTable)
        .where(
          and(
            eq(opportunitiesTable.noticeId, externalId),
            eq(opportunitiesTable.source, mappedSource),
          ),
        );

      if (existing.length > 0) {
        // Build the source-derived fields only; never touch the primary key,
        // userGrade, userConfidence, or notes (user-controlled columns).
        const dbRecord = normalizedToDbRecord(opportunity);
        const { userGrade: _g, userConfidence: _c, notes: _n, ...sourceFields } = dbRecord as typeof dbRecord & {
          userGrade?: unknown;
          userConfidence?: unknown;
          notes?: unknown;
        };
        await db
          .update(opportunitiesTable)
          .set({ ...sourceFields, updatedAt: new Date() })
          .where(eq(opportunitiesTable.id, existing[0].id));
        result.updated++;
        persistedForIndex.push(opportunity);
        continue;
      }
    }

    // New record — generate the primary key here (and only here).
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
