/**
 * Unified Fetch Pipeline
 *
 * Aggregates RFP opportunity records from configured RFP providers, normalizes,
 * deduplicates, scores, persists to the RFP DB, and optionally writes vectors to
 * Qdrant/Pinecone for future similarity retrieval.
 */

import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";

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

type PersistenceOutcome = "created" | "updated";

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSourceUrl(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value.trim();
  }
}

function persistenceNoticeId(opportunity: NormalizedOpportunity): string {
  const externalId = opportunity.externalId?.trim();
  if (externalId) return externalId;

  const sourceUrl = canonicalSourceUrl(opportunity.sourceUrl);
  if (sourceUrl) return `generated-url-${stableHash(sourceUrl).slice(0, 32)}`;

  const solicitationNumber = opportunity.solicitationNumber
    ?.replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  if (solicitationNumber && solicitationNumber.length >= 4) {
    return `generated-sol-${stableHash(solicitationNumber).slice(0, 32)}`;
  }

  const fingerprint = [
    opportunity.title,
    opportunity.agency ?? "",
    opportunity.responseDeadline?.toISOString() ?? "",
  ]
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .join("|");
  return `generated-row-${stableHash(fingerprint).slice(0, 32)}`;
}

async function persistOpportunityAtomically(
  opportunity: NormalizedOpportunity,
): Promise<PersistenceOutcome> {
  const normalized = normalizedToDbRecord(opportunity);
  const providerKey = normalized.providerKey ?? "manual";
  const noticeId = persistenceNoticeId(opportunity);
  const canonicalUrl = canonicalSourceUrl(opportunity.sourceUrl);
  const lockKey = `${providerKey}::${noticeId}`;
  const now = new Date();

  return db.transaction(async (transaction) => {
    // Transaction-scoped advisory locking serializes competing manual fetches for
    // the same provider notice without blocking unrelated opportunity records.
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );

    const existing = await transaction
      .select({ id: opportunitiesTable.id })
      .from(opportunitiesTable)
      .where(
        and(
          eq(opportunitiesTable.providerKey, providerKey),
          eq(opportunitiesTable.noticeId, noticeId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      // Provider refreshes may update only source-derived fields. User grades,
      // learned confidence, and user notes remain untouched.
      const {
        userGrade: _userGrade,
        userConfidence: _userConfidence,
        notes: _notes,
        ...sourceFields
      } = normalized as typeof normalized & {
        userGrade?: unknown;
        userConfidence?: unknown;
        notes?: unknown;
      };

      await transaction
        .update(opportunitiesTable)
        .set({
          ...sourceFields,
          noticeId,
          providerKey,
          samUrl: canonicalUrl ?? sourceFields.samUrl,
          updatedAt: now,
        })
        .where(eq(opportunitiesTable.id, existing[0].id));
      return "updated";
    }

    await transaction.insert(opportunitiesTable).values({
      ...normalized,
      id: randomUUID(),
      noticeId,
      providerKey,
      samUrl: canonicalUrl ?? normalized.samUrl,
      createdAt: now,
      updatedAt: now,
    });
    return "created";
  });
}

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
    if (keys.some((key) => seenKeys.has(key))) {
      result.skipped++;
      return false;
    }
    keys.forEach((key) => seenKeys.add(key));
    return true;
  });

  const persistedForIndex: NormalizedOpportunity[] = [];
  for (const { opportunity } of deduped) {
    const outcome = await persistOpportunityAtomically(opportunity);
    if (outcome === "created") result.created++;
    else result.updated++;
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

function dedupeKeys(opportunity: NormalizedOpportunity): string[] {
  const keys: string[] = [];
  if (opportunity.externalId) keys.push(`id:${opportunity.externalId.toLowerCase()}`);
  if (opportunity.solicitationNumber) {
    const solicitationNumber = opportunity.solicitationNumber.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (solicitationNumber.length >= 4) keys.push(`sol:${solicitationNumber}`);
  }
  const host = hostFromUrl(opportunity.sourceUrl);
  const sourceUrl = canonicalSourceUrl(opportunity.sourceUrl);
  if (sourceUrl) keys.push(`url:${sourceUrl.toLowerCase()}`);
  const normalizedTitle = opportunity.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  if (normalizedTitle.length >= 8) keys.push(`title:${normalizedTitle}|${host ?? (opportunity.agency ?? "").toLowerCase()}`);
  return keys;
}
