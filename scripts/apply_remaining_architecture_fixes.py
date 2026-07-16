from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(text: str, old: str, new: str, path: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1. Retire statePortals as a formal provider while preserving its internal
#    official-portal discovery logic and legacy request aliases.
# ---------------------------------------------------------------------------
state_path = ROOT / "api-server/src/lib/providers/statePortals.ts"
state = state_path.read_text()
state = replace_once(
    state,
    '''import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";''',
    'import type { NormalizedOpportunity } from "./types";',
    str(state_path),
)
state = replace_once(
    state,
    'export class StatePortalsProvider implements DataSourceProvider {\n  readonly name = "statePortals" as const;\n',
    'export class PublicPortalDiscovery {',
    str(state_path),
)
state, removed = re.subn(
    r'\n  async fetch\(options: FetchOptions\): Promise<ProviderFetchResult> \{.*?\n  async search\(',
    '\n  async search(',
    state,
    count=1,
    flags=re.S,
)
if removed != 1:
    raise SystemExit("Could not remove the obsolete statePortals provider fetch/status methods")
state = replace_once(
    state,
    'export const statePortalsProvider = new StatePortalsProvider();',
    'export const publicPortalDiscovery = new PublicPortalDiscovery();',
    str(state_path),
)
for old, new in [
    ("StatePortalSearchPlanDiagnostics", "PublicPortalSearchPlanDiagnostics"),
    ("StatePortalSearchPlan", "PublicPortalSearchPlan"),
    ("StatePortalPlannedQuery", "PublicPortalPlannedQuery"),
    ("StatePortal", "PublicPortalDiscoverySource"),
    ("STATE_PORTALS", "PUBLIC_PORTAL_DISCOVERY_SOURCES"),
    ("toStatePortal", "toPublicPortalDiscoverySource"),
    ("buildStatePortalSearchPlan", "buildPublicPortalSearchPlan"),
    ("getStatePortalSearchPlanDiagnostics", "getPublicPortalSearchPlanDiagnostics"),
    ('source: "statePortals" as const', 'source: "publicPortalProviders" as const'),
    ('externalId: `direct-state-${urlHash}`', 'externalId: `public-portal-${urlHash}`'),
    ('providerName: "direct_official_state_rfp_portals"', 'providerName: "direct_official_public_rfp_portals"'),
    ('"Official State RFP Portal"', '"Official Public RFP Portal"'),
]:
    state = state.replace(old, new)
new_state_path = ROOT / "api-server/src/lib/providers/publicPortalDiscovery.ts"
new_state_path.write_text(state)
state_path.unlink()

# Update imports and exported diagnostic names throughout TypeScript sources.
for path in ROOT.rglob("*.ts*"):
    text = path.read_text()
    updated = text
    updated = updated.replace('"../providers/statePortals"', '"../providers/publicPortalDiscovery"')
    updated = updated.replace('"./statePortals"', '"./publicPortalDiscovery"')
    updated = updated.replace("statePortalsProvider", "publicPortalDiscovery")
    updated = updated.replace("getStatePortalSearchPlanDiagnostics", "getPublicPortalSearchPlanDiagnostics")
    updated = updated.replace("buildStatePortalSearchPlan", "buildPublicPortalSearchPlan")
    updated = updated.replace("StatePortalSearchPlanDiagnostics", "PublicPortalSearchPlanDiagnostics")
    updated = updated.replace("StatePortalSearchPlan", "PublicPortalSearchPlan")
    updated = updated.replace("StatePortalPlannedQuery", "PublicPortalPlannedQuery")
    updated = updated.replace("STATE_PORTALS", "PUBLIC_PORTAL_DISCOVERY_SOURCES")
    if updated != text:
        path.write_text(updated)


# ---------------------------------------------------------------------------
# 2. Provider definitions and registry boundaries.
# ---------------------------------------------------------------------------
path = "api-server/src/lib/config/providerConfig.ts"
text = read(path)
text = replace_once(text, '  | "eunaBonfire"\n', '  | "eunaBonfire"\n  | "internationalPublicPortals"\n', path)
text = replace_once(text, '  | "statePortals"\n', '', path)
text = replace_once(
    text,
    '  eunaBonfire: provider("eunaBonfire", "Euna Supplier Network", "procurement", "web_discovery", [], ["Standalone Euna/Bonfire opportunity discovery", "Public agency portal results", "Occu-Med relevance filtering", "Cross-provider deduplication"], "live", "Separate Euna Supplier Network / Bonfire provider that discovers public opportunity pages through the configured Serper key. No Euna credentials are stored."),\n',
    '  eunaBonfire: provider("eunaBonfire", "Euna Supplier Network", "procurement", "web_discovery", [], ["Standalone Euna/Bonfire opportunity discovery", "Public agency portal results", "Occu-Med relevance filtering", "Cross-provider deduplication"], "live", "Separate Euna Supplier Network / Bonfire provider that discovers public opportunity pages through the configured Serper key. No Euna credentials are stored."),\n  internationalPublicPortals: provider("internationalPublicPortals", "International Public Portals", "procurement", "web_discovery", [], ["Canada, United Kingdom, Europe, and multilateral portals", "Official-domain opportunity discovery", "International buyer and jurisdiction metadata", "Cross-provider deduplication"], "live", "Separate international opportunity provider covering the official portals in the International Opportunities directory. It uses the configured Serper key and does not automate supplier logins."),\n',
    path,
)
text = re.sub(r'\n  statePortals: provider\([^\n]+\),', '', text, count=1)
text = replace_once(
    text,
    '  grantsGov: provider("grantsGov", "Grants.gov", "primary", "direct_source", [], ["Federal grants search", "Health program funding discovery"], "live", "Public federal grants database — no API key required."),',
    '  grantsGov: {\n    ...provider("grantsGov", "Grants.gov", "primary", "research_analysis", [], ["Federal grants search", "Health program funding discovery"], "live", "Public federal grants database — no API key required."),\n    notes: "Funding and program intelligence only. Grants.gov is excluded from RFP opportunity ingestion and cards.",\n  },',
    path,
)
write(path, text)

path = "api-server/src/lib/providers/index.ts"
text = read(path)
text = replace_once(text, 'export * from "./eunaBonfire";\n', 'export * from "./eunaBonfire";\nexport * from "./internationalPublicPortals";\n', path)
text = text.replace('export * from "./publicPortalDiscovery";\n', '')
text = replace_once(text, 'import { eunaBonfireProvider } from "./eunaBonfire";\n', 'import { eunaBonfireProvider } from "./eunaBonfire";\nimport { internationalPublicPortalsProvider } from "./internationalPublicPortals";\n', path)
text = text.replace('import { publicPortalDiscovery } from "./publicPortalDiscovery";\n', '')
text = replace_once(text, '  eunaBonfire: eunaBonfireProvider,\n', '  eunaBonfire: eunaBonfireProvider,\n  internationalPublicPortals: internationalPublicPortalsProvider,\n', path)
text = text.replace('  statePortals: publicPortalDiscovery as unknown as DataSourceProvider,\n', '')
write(path, text)

path = "api-server/src/routes/providers.ts"
text = read(path)
text = replace_once(
    text,
    'const INTERNAL_PUBLIC_PORTAL_ADAPTERS = new Set<RfpProviderName>(["texasEsbd", "nyScr", "statePortals"]);',
    'const INTERNAL_PUBLIC_PORTAL_ADAPTERS = new Set<RfpProviderName>(["texasEsbd", "nyScr"]);',
    path,
)
write(path, text)


# ---------------------------------------------------------------------------
# 3. Add the separate international opportunity provider.
# ---------------------------------------------------------------------------
international_provider = r'''import { createHash } from "crypto";

import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { serperProvider, type SerperSearchResult } from "./serper";
import { extractMetadataFromText } from "../search/heuristicExtract";
import { classifyResult } from "../search/relevance";
import { ENRICHED_DIRECT_RFP_PORTALS, type EnrichedDirectRfpPortal } from "./directRfpPortalRelevanceCatalog";
import { INTERNATIONAL_PORTAL_GROUPS } from "./portalDirectory";

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_LIMIT = 75;
const MAX_DOMAINS_PER_QUERY = 5;
const PROCUREMENT_EXPRESSION = "(RFP OR RFQ OR tender OR bid OR solicitation OR procurement)";
const SERVICE_EXPRESSION = '("occupational health" OR "occupational medicine" OR "employee health" OR "medical surveillance" OR "fitness for duty" OR "pre-employment physical" OR "drug testing" OR "alcohol testing" OR audiometric OR spirometry OR "respirator fit testing")';

const INTERNATIONAL_PORTAL_IDS = new Set(
  INTERNATIONAL_PORTAL_GROUPS.flatMap((group) => group.portalIds),
);
const INTERNATIONAL_PORTALS = ENRICHED_DIRECT_RFP_PORTALS.filter((portal) =>
  INTERNATIONAL_PORTAL_IDS.has(portal.id as never),
);

function normalizedHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function portalForUrl(url: string): EnrichedDirectRfpPortal | undefined {
  try {
    const host = normalizedHost(new URL(url).hostname);
    return INTERNATIONAL_PORTALS.find((portal) => {
      const domain = normalizedHost(portal.domain);
      return host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`);
    });
  } catch {
    return undefined;
  }
}

function groupForPortal(portalId: string): string | undefined {
  return INTERNATIONAL_PORTAL_GROUPS.find((group) =>
    group.portalIds.includes(portalId as never),
  )?.title;
}

function hasStaleYearOnly(text: string): boolean {
  const years = Array.from(text.matchAll(/\b20\d{2}\b/g)).map((match) => Number(match[0]));
  if (years.length === 0) return false;
  const hasCurrentOrFuture = years.some((year) => year >= CURRENT_YEAR && year <= CURRENT_YEAR + 2);
  return years.some((year) => year < CURRENT_YEAR) && !hasCurrentOrFuture;
}

function parsedDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizedResultKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${normalizedHost(parsed.hostname)}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function isUsefulResult(result: SerperSearchResult, portal: EnrichedDirectRfpPortal): boolean {
  const raw = `${result.title} ${result.snippet} ${result.link}`;
  if (hasStaleYearOnly(raw)) return false;
  const classification = classifyResult({
    title: result.title,
    snippet: result.snippet,
    url: result.link,
    allowHistorical: false,
  });
  if (classification.rejected) return false;
  if (!/\b(rfp|rfq|tender|bid|solicitation|procurement)\b/i.test(raw)) return false;
  if (!/(occupational|employee health|medical surveillance|fitness for duty|pre[- ]employment|drug testing|alcohol testing|audiometric|spirometry|respirator fit)/i.test(raw)) return false;
  return portal.country !== "US";
}

function resultToOpportunity(
  result: SerperSearchResult,
  portal: EnrichedDirectRfpPortal,
): NormalizedOpportunity | null {
  if (!isUsefulResult(result, portal)) return null;
  const metadata = extractMetadataFromText(result.snippet, result.title);
  if (metadata.deadline && metadata.deadline < new Date()) return null;
  const postedDate = parsedDate(result.date);
  const resultKey = normalizedResultKey(result.link);
  const urlHash = createHash("sha256").update(resultKey).digest("hex").slice(0, 20);

  return {
    externalId: `international-${urlHash}`,
    title: result.title.trim() || "International Public Procurement Opportunity",
    agency: metadata.agencyHint ?? portal.jurisdiction,
    type: "Solicitation",
    status: "active",
    postedDate: postedDate ?? new Date(),
    responseDeadline: metadata.deadline,
    estimatedValue: metadata.estimatedValue,
    description: result.snippet,
    location: portal.jurisdiction,
    sourceUrl: result.link,
    source: "internationalPublicPortals",
    providerName: "internationalPublicPortals",
    rawData: {
      providerFamily: "international_public_portal",
      providerType: "serper_official_international_portal",
      discoveryMethod: "serper_official_domain",
      sourceId: portal.id,
      portalName: portal.name,
      jurisdiction: portal.jurisdiction,
      country: portal.country,
      regionGroup: groupForPortal(portal.id),
      sourceConfidence: portal.parserStatus === "ready_to_parse" ? "high" : "medium",
      occumedFit: portal.occumedFit,
      dateUnknown: !postedDate,
      tags: ["international-opportunity", `country:${portal.country}`, "official-procurement-portal"],
      notes: "Discovered from an official portal in the International Opportunities directory; no supplier login was automated.",
    },
  };
}

function domainGroups(): EnrichedDirectRfpPortal[][] {
  const groups: EnrichedDirectRfpPortal[][] = [];
  for (let index = 0; index < INTERNATIONAL_PORTALS.length; index += MAX_DOMAINS_PER_QUERY) {
    groups.push(INTERNATIONAL_PORTALS.slice(index, index + MAX_DOMAINS_PER_QUERY));
  }
  return groups;
}

export function buildInternationalPortalQueries(keywords?: string): string[] {
  const keywordExpression = keywords?.trim() ? ` (${keywords.trim()})` : "";
  return domainGroups().map((portals) => {
    const domains = portals.map((portal) => `site:${portal.domain}`).join(" OR ");
    return `(${domains}) ${SERVICE_EXPRESSION} ${PROCUREMENT_EXPRESSION}${keywordExpression} (${CURRENT_YEAR} OR ${CURRENT_YEAR + 1}) -awarded -\"award notice\"`;
  });
}

export class InternationalPublicPortalsProvider implements DataSourceProvider {
  readonly name = "internationalPublicPortals" as const;

  async isConfigured(): Promise<boolean> {
    return serperProvider.isConfigured();
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    if (!(await this.isConfigured())) {
      return {
        records: [],
        total: 0,
        errors: ["Serper API key not configured; international official-portal discovery is disabled."],
      };
    }

    const queries = buildInternationalPortalQueries(options.keywords);
    const results = await serperProvider.searchMultiple(queries, 10);
    const seen = new Set<string>();
    const records: NormalizedOpportunity[] = [];
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT);

    for (const result of results) {
      if (!result.link) continue;
      const key = normalizedResultKey(result.link);
      if (seen.has(key)) continue;
      seen.add(key);
      const portal = portalForUrl(result.link);
      if (!portal) continue;
      const opportunity = resultToOpportunity(result, portal);
      if (!opportunity) continue;
      records.push(opportunity);
      if (records.length >= limit) break;
    }

    return { records, total: records.length, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return {
      name: this.name,
      configured,
      healthy: configured,
      recordCount: INTERNATIONAL_PORTALS.length,
      errorMessage: configured
        ? undefined
        : "Uses the existing Serper key to discover public international opportunity pages.",
    };
  }
}

export const internationalPublicPortalsProvider = new InternationalPublicPortalsProvider();
'''
write("api-server/src/lib/providers/internationalPublicPortals.ts", international_provider)


# ---------------------------------------------------------------------------
# 4. Harden Public Portal Providers with bounded concurrency, per-source
#    timeouts, a whole-run deadline, failure isolation, and partial results.
# ---------------------------------------------------------------------------
public_portal_provider = r'''import { nyScrProvider } from "../nyScr";
import { texasEsbdProvider } from "../texasEsbd";
import { publicPortalDiscovery } from "../publicPortalDiscovery";
import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "../types";
import { PUBLIC_PORTAL_SOURCES, type PublicPortalSource, validatePublicPortalSource } from "./catalog";
import { extractPdfLinkOpportunities, extractStaticHtmlOpportunities, withPublicPortalMetadata } from "./genericExtractors";

export interface PublicPortalSourceRunStatus {
  sourceId: string;
  lastCheckedAt: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastFailureReason?: string;
  resultCount: number;
  matchedCount: number;
}

const DEFAULT_LIMIT = 100;
const MIN_DOMAIN_INTERVAL_MS = 1_000;
const DEFAULT_SOURCE_TIMEOUT_MS = 25_000;
const DEFAULT_RUN_TIMEOUT_MS = 90_000;
const DEFAULT_CONCURRENCY = 4;
const lastDomainFetchAt = new Map<string, number>();
const sourceStatuses = new Map<string, PublicPortalSourceRunStatus>();

const SOURCE_ADAPTERS: Record<string, DataSourceProvider> = {
  "tx-esbd": texasEsbdProvider,
  "ny-contract-reporter": nyScrProvider,
};

function positiveIntegerEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function isOccuMedMatch(record: NormalizedOpportunity): boolean {
  return Boolean(record.rawData?.occuMedMatched);
}

function sourceIdForRecord(record: NormalizedOpportunity): string | undefined {
  const value = record.rawData?.sourceId ?? record.rawData?.parsedPortalSourceId;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function opportunityKey(record: NormalizedOpportunity): string {
  if (record.sourceUrl) {
    try {
      const parsed = new URL(record.sourceUrl);
      return `url:${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname.replace(/\/$/, "").toLowerCase()}${parsed.search.toLowerCase()}`;
    } catch {
      return `url:${record.sourceUrl.toLowerCase()}`;
    }
  }
  if (record.solicitationNumber) return `sol:${record.solicitationNumber.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
  return `id:${record.externalId.toLowerCase()}`;
}

async function waitForDomainRateLimit(domain: string): Promise<void> {
  const lastFetchAt = lastDomainFetchAt.get(domain) ?? 0;
  const waitMs = Math.max(0, MIN_DOMAIN_INTERVAL_MS - (Date.now() - lastFetchAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastDomainFetchAt.set(domain, Date.now());
}

async function withTimeout<T>(task: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchHtml(source: PublicPortalSource, timeoutMs: number): Promise<string> {
  await waitForDomainRateLimit(source.domain);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(source.sourceUrl, {
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "OccuMed-InsightHub/1.0 public procurement catalog crawler (+https://www.occumed.com)",
      },
    });
    if (!response.ok) throw new Error(`${source.id} returned HTTP ${response.status}`);
    return response.text();
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${source.id} timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function runExistingParser(source: PublicPortalSource, options: FetchOptions): Promise<NormalizedOpportunity[]> {
  const adapter = SOURCE_ADAPTERS[source.id];
  if (adapter) return (await adapter.fetch(options)).records.map((record) => withPublicPortalMetadata(record, source));
  throw new Error(`No existing parser is registered for public portal source ${source.id}`);
}

async function runSource(source: PublicPortalSource, options: FetchOptions, timeoutMs: number): Promise<NormalizedOpportunity[]> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT);
  if (SOURCE_ADAPTERS[source.id]) return runExistingParser(source, { ...options, limit });
  if (source.scraperType === "existing_parser") return runExistingParser(source, { ...options, limit });
  if (source.scraperType === "static_html") return extractStaticHtmlOpportunities(await fetchHtml(source, timeoutMs), source, limit);
  if (source.scraperType === "pdf_links") return extractPdfLinkOpportunities(await fetchHtml(source, timeoutMs), source, limit);
  if (source.scraperType === "scrapy") throw new Error(`Scrapy source ${source.id} is reserved until a real spider is added`);
  if (source.scraperType === "playwright_public") throw new Error(`Playwright source ${source.id} is reserved until a real public-page runner is added`);
  if (source.scraperType === "rss" || source.scraperType === "public_json") throw new Error(`${source.scraperType} source ${source.id} needs a concrete adapter before it can run`);
  return [];
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), Math.max(items.length, 1));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    }),
  );
}

export class PublicPortalProvidersProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  constructor(private readonly sources: PublicPortalSource[] = PUBLIC_PORTAL_SOURCES) {}

  async isConfigured(): Promise<boolean> { return true; }

  getSources(): PublicPortalSource[] { return this.sources; }

  getSourceStatuses(): PublicPortalSourceRunStatus[] { return Array.from(sourceStatuses.values()); }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const enabledSources = this.sources.filter(
      (source) => source.enabled && source.verificationStatus === "verified",
    );
    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];
    const sourceTimeoutMs = positiveIntegerEnv("PUBLIC_PORTAL_SOURCE_TIMEOUT_MS", DEFAULT_SOURCE_TIMEOUT_MS, 5_000, 120_000);
    const runTimeoutMs = positiveIntegerEnv("PUBLIC_PORTAL_RUN_TIMEOUT_MS", DEFAULT_RUN_TIMEOUT_MS, 15_000, 300_000);
    const concurrency = positiveIntegerEnv("PUBLIC_PORTAL_CONCURRENCY", DEFAULT_CONCURRENCY, 1, 10);
    const runDeadlineAt = Date.now() + runTimeoutMs;
    const resultLimit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT);

    await runWithConcurrency(enabledSources, concurrency, async (source) => {
      const lastCheckedAt = new Date();
      const validationErrors = validatePublicPortalSource(source);
      if (validationErrors.length) {
        const reason = validationErrors.join("; ");
        errors.push(`${source.id}: ${reason}`);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastFailureAt: lastCheckedAt, lastFailureReason: reason, resultCount: 0, matchedCount: 0 });
        return;
      }

      const remainingMs = runDeadlineAt - Date.now();
      if (remainingMs <= 0) {
        const reason = "provider run deadline reached before this source started";
        errors.push(`${source.id}: ${reason}`);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastFailureAt: lastCheckedAt, lastFailureReason: reason, resultCount: 0, matchedCount: 0 });
        return;
      }

      const effectiveTimeout = Math.min(sourceTimeoutMs, remainingMs);
      try {
        const sourceRecords = await withTimeout(
          () => runSource(source, options, effectiveTimeout),
          effectiveTimeout,
          source.id,
        );
        records.push(...sourceRecords);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastSuccessAt: new Date(), resultCount: sourceRecords.length, matchedCount: sourceRecords.filter(isOccuMedMatch).length });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(`${source.id}: ${reason}`);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastFailureAt: new Date(), lastFailureReason: reason, resultCount: 0, matchedCount: 0 });
      }
    });

    const remainingForDiscovery = runDeadlineAt - Date.now();
    if (remainingForDiscovery <= 0) {
      errors.push("serper-official-portal-discovery: skipped because the provider run deadline was reached");
    } else if (await publicPortalDiscovery.isConfigured()) {
      try {
        const discoveredPages = await withTimeout(
          () => publicPortalDiscovery.search({ keywords: options.keywords }),
          Math.min(sourceTimeoutMs, remainingForDiscovery),
          "serper-official-portal-discovery",
        );
        const sourceById = new Map(this.sources.map((source) => [source.id, source]));
        const seen = new Set(records.map(opportunityKey));
        const discoveredRecords = publicPortalDiscovery.toOpportunities(discoveredPages);

        for (const discovered of discoveredRecords) {
          const sourceId = sourceIdForRecord(discovered);
          const source = sourceId ? sourceById.get(sourceId) : undefined;
          const normalized: NormalizedOpportunity = source
            ? withPublicPortalMetadata({
                ...discovered,
                source: "publicPortalProviders",
                providerName: "publicPortalProviders",
                rawData: { ...(discovered.rawData ?? {}), discoveryMethod: "serper_official_portal", serperFallback: true },
              }, source)
            : {
                ...discovered,
                source: "publicPortalProviders",
                providerName: "publicPortalProviders",
                rawData: {
                  ...(discovered.rawData ?? {}),
                  providerFamily: "public_portal",
                  providerType: "serper_official_portal",
                  sourceBadge: "Public Portal Search",
                  discoveryMethod: "serper_official_portal",
                  serperFallback: true,
                },
              };

          const key = opportunityKey(normalized);
          if (seen.has(key)) continue;
          seen.add(key);
          records.push(normalized);

          if (sourceId) {
            const prior = sourceStatuses.get(sourceId);
            const succeededAt = new Date();
            sourceStatuses.set(sourceId, {
              sourceId,
              lastCheckedAt: prior?.lastCheckedAt ?? succeededAt,
              lastSuccessAt: succeededAt,
              lastFailureAt: prior?.lastFailureAt,
              lastFailureReason: prior?.lastFailureReason,
              resultCount: (prior?.resultCount ?? 0) + 1,
              matchedCount: (prior?.matchedCount ?? 0) + (isOccuMedMatch(normalized) ? 1 : 0),
            });
          }
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(`serper-official-portal-discovery: ${reason}`);
      }
    }

    const limitedRecords = records.slice(0, resultLimit);
    return { records: limitedRecords, total: limitedRecords.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    const statuses = Array.from(sourceStatuses.values());
    const hasCurrentFailure = statuses.some((status) => status.lastFailureAt && (!status.lastSuccessAt || status.lastFailureAt > status.lastSuccessAt));
    return { name: this.name, configured: true, healthy: !hasCurrentFailure, recordCount: statuses.reduce((sum, status) => sum + status.resultCount, 0) };
  }
}

export const publicPortalProvidersProvider = new PublicPortalProvidersProvider();
export * from "./catalog";
export * from "./genericExtractors";
'''
write("api-server/src/lib/providers/publicPortalProviders/index.ts", public_portal_provider)


# ---------------------------------------------------------------------------
# 5. RFP pipeline boundaries and scheduler defaults.
# ---------------------------------------------------------------------------
path = "api-server/src/lib/search/unifiedSearch.ts"
text = read(path)
text = replace_once(text, 'import { eunaBonfireProvider } from "../providers/eunaBonfire";\n', 'import { eunaBonfireProvider } from "../providers/eunaBonfire";\nimport { internationalPublicPortalsProvider } from "../providers/internationalPublicPortals";\n', path)
text = text.replace('import { grantsGovProvider } from "../providers/grantsGov";\n', '')
text = replace_once(
    text,
    'const INTEL_ONLY_PROVIDERS = new Set(["usaSpending", "federalRegister"]);',
    'const INTEL_ONLY_PROVIDERS = new Set(["usaSpending", "federalRegister", "grantsGov"]);',
    path,
)
text = replace_once(text, '  await runProvider("eunaBonfire", eunaBonfireProvider);\n  await runProvider("grantsGov", grantsGovProvider);\n', '  await runProvider("eunaBonfire", eunaBonfireProvider);\n  await runProvider("internationalPublicPortals", internationalPublicPortalsProvider);\n', path)
write(path, text)

path = "api-server/src/lib/search/scheduler.ts"
text = read(path)
text = replace_once(
    text,
    '// RFP-only defaults. USAspending and Federal Register are intentionally excluded:\n// they are intel/award/regulatory sources and should not publish direct RFP cards.\nconst DEFAULT_INGESTION_PROVIDERS = ["samGov", "grantsGov", "publicPortalProviders", "eunaBonfire", "serper", "tavily"];',
    '// Opportunity-source defaults only. Grants.gov, USAspending, Federal Register,\n// broad research tools, and AI enrichment providers are intentionally excluded.\nconst DEFAULT_INGESTION_PROVIDERS = ["samGov", "publicPortalProviders", "eunaBonfire", "internationalPublicPortals"];',
    path,
)
write(path, text)

path = "render.yaml"
text = read(path)
text = replace_once(
    text,
    'value: samGov,grantsGov,publicPortalProviders,eunaBonfire,serper,tavily',
    'value: samGov,publicPortalProviders,eunaBonfire,internationalPublicPortals',
    path,
)
write(path, text)

path = "api-server/src/routes/opportunities.ts"
text = read(path)
text = replace_once(
    text,
    '      eunaSupplierNetwork: "eunaBonfire",\n',
    '      eunaSupplierNetwork: "eunaBonfire",\n      internationalPublicPortals: "internationalPublicPortals",\n      international_public_portals: "internationalPublicPortals",\n      internationalOpportunities: "internationalPublicPortals",\n',
    path,
)
write(path, text)


# ---------------------------------------------------------------------------
# 6. Clean up the Opportunities UI: actual opportunity sources are distinct
#    from optional discovery tools; grants/spending and AI enrichment disappear
#    from the RFP fetch selector and active-source strip.
# ---------------------------------------------------------------------------
path = "intel-suite/src/pages/portal/opportunities.tsx"
text = read(path)
new_options = '''type FetchProviderOption = {
  key: string;
  label: string;
  desc: string;
  stub: boolean;
};

const FETCH_PROVIDER_GROUPS: { id: string; label: string; options: FetchProviderOption[] }[] = [
  {
    id: "opportunity_sources",
    label: "Opportunity Sources",
    options: [
      { key: "sam_gov", label: "SAM.gov", desc: "U.S. federal solicitations", stub: false },
      { key: "publicPortalProviders", label: "U.S. Public Portals", desc: "Official state and local portal coverage", stub: false },
      { key: "eunaBonfire", label: "Euna Supplier Network", desc: "Separate public Bonfire/Euna discovery", stub: false },
      { key: "internationalPublicPortals", label: "International Public Portals", desc: "Canada, United Kingdom, Europe, and multilateral portals", stub: false },
      { key: "tango", label: "Tango", desc: "Direct procurement opportunities", stub: false },
      { key: "bidnet", label: "BidNet", desc: "Inactive until the direct API credentials are added", stub: true },
    ],
  },
  {
    id: "web_discovery",
    label: "Optional Web Discovery",
    options: [
      { key: "serper", label: "Serper", desc: "Broad public-web opportunity discovery", stub: false },
      { key: "tavily", label: "Tavily", desc: "Research-oriented opportunity discovery", stub: false },
      { key: "exa", label: "Exa", desc: "Semantic public-web discovery", stub: false },
    ],
  },
];

const OPPORTUNITY_PROVIDER_NAMES = new Set([
  "samGov",
  "publicPortalProviders",
  "eunaBonfire",
  "internationalPublicPortals",
  "tango",
  "bidnet",
  "serper",
  "tavily",
  "exa",
]);'''
text, count = re.subn(r'const FETCH_PROVIDER_OPTIONS = \[.*?\n\];', new_options, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit("Could not replace FETCH_PROVIDER_OPTIONS")
text, count = re.subn(
    r'  // grantsGov \+ usaSpending are free.*?\n  const \[fetchProviders, setFetchProviders\] = useState<string\[]>\(\[[^\n]+\]\);',
    '  const [fetchProviders, setFetchProviders] = useState<string[]>(["sam_gov", "publicPortalProviders", "eunaBonfire", "internationalPublicPortals"]);',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("Could not replace the fetch provider defaults")
text = replace_once(
    text,
    '{providersData?.providers.map((p) => {',
    '{providersData?.providers.filter((p) => OPPORTUNITY_PROVIDER_NAMES.has(p.name)).map((p) => {',
    path,
)
old_modal = '''                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Data Sources</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[340px] overflow-y-auto pr-1">
                  {FETCH_PROVIDER_OPTIONS.map(({ key, label, desc, stub }) => {
                    const checked = fetchProviders.includes(key);
                    return (
                      <button key={key} type="button" disabled={stub} onClick={() => !stub && toggleFetchProvider(key)} className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-colors ${stub ? "border-white/5 bg-white/2 opacity-40 cursor-not-allowed" : checked ? "border-primary/40 bg-primary/10 cursor-pointer" : "border-white/10 bg-white/3 hover:bg-white/5 cursor-pointer"}`}>
                        <div className={`mt-0.5 w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center ${stub ? "border-white/20" : checked ? "border-primary bg-primary" : "border-white/20"}`}>
                          {checked && !stub && <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium leading-none">{label}</span>
                            {stub && <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-500/70 font-medium"><Clock className="w-2.5 h-2.5" /> Pending</span>}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>'''
new_modal = '''                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Sources</Label>
                <div className="grid gap-4 max-h-[390px] overflow-y-auto pr-1">
                  {FETCH_PROVIDER_GROUPS.map((group) => (
                    <div key={group.id} className="grid gap-2">
                      <div className="text-[10px] uppercase tracking-wider text-white/45">{group.label}</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {group.options.map(({ key, label, desc, stub }) => {
                          const checked = fetchProviders.includes(key);
                          return (
                            <button key={key} type="button" disabled={stub} onClick={() => !stub && toggleFetchProvider(key)} className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-colors ${stub ? "border-white/5 bg-white/2 opacity-40 cursor-not-allowed" : checked ? "border-primary/40 bg-primary/10 cursor-pointer" : "border-white/10 bg-white/3 hover:bg-white/5 cursor-pointer"}`}>
                              <div className={`mt-0.5 w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center ${stub ? "border-white/20" : checked ? "border-primary bg-primary" : "border-white/20"}`}>
                                {checked && !stub && <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-medium leading-none">{label}</span>
                                  {stub && <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-500/70 font-medium"><Clock className="w-2.5 h-2.5" /> Pending</span>}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>'''
text = replace_once(text, old_modal, new_modal, path)
text = replace_once(
    text,
    'Choose sources and enter a search-style query for this intelligence run.',
    'Choose official opportunity sources and, when needed, optional web-discovery services.',
    path,
)
write(path, text)


# Guardrails: no formal statePortals provider remains, while legacy request aliases stay.
provider_config = read("api-server/src/lib/config/providerConfig.ts")
provider_index = read("api-server/src/lib/providers/index.ts")
if '| "statePortals"' in provider_config or 'statePortals:' in provider_config:
    raise SystemExit("statePortals still exists in providerConfig")
if 'statePortals:' in provider_index or 'statePortalsProvider' in provider_index:
    raise SystemExit("statePortals still exists in providerRegistry")
if '"statePortals", "publicPortalProviders"' not in read("api-server/src/lib/search/unifiedSearch.ts"):
    raise SystemExit("Legacy statePortals alias was not preserved")
if 'statePortals: "publicPortalProviders"' not in read("api-server/src/routes/opportunities.ts"):
    raise SystemExit("Legacy statePortals request routing was not preserved")

print("Remaining architecture fixes applied successfully.")
