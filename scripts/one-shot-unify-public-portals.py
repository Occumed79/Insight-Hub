from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


path = Path("api-server/src/lib/providers/publicPortalProviders/index.ts")
text = path.read_text()
text = text.replace(
    'import { texasEsbdProvider } from "../texasEsbd";\n',
    'import { texasEsbdProvider } from "../texasEsbd";\nimport { statePortalsProvider } from "../statePortals";\n',
    1,
)
marker = '''function isOccuMedMatch(record: NormalizedOpportunity): boolean {
  return Boolean(record.rawData?.occuMedMatched);
}
'''
helper = '''function isOccuMedMatch(record: NormalizedOpportunity): boolean {
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
      return `url:${parsed.hostname.replace(/^www\\./, "").toLowerCase()}${parsed.pathname.replace(/\\/$/, "").toLowerCase()}`;
    } catch {
      return `url:${record.sourceUrl.toLowerCase()}`;
    }
  }
  if (record.solicitationNumber) return `sol:${record.solicitationNumber.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
  return `id:${record.externalId.toLowerCase()}`;
}
'''
if marker not in text:
    raise SystemExit("Public portal helper marker not found")
text = text.replace(marker, helper, 1)

start = text.index('  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {')
end = text.index('  async getStatus(): Promise<ProviderStatus> {', start)
new_fetch = '''  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const enabledSources = this.sources.filter(
      (source) => source.enabled && source.verificationStatus === "verified",
    );
    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];

    for (const source of enabledSources) {
      const validationErrors = validatePublicPortalSource(source);
      const lastCheckedAt = new Date();
      if (validationErrors.length) {
        const reason = validationErrors.join("; ");
        errors.push(`${source.id}: ${reason}`);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastFailureAt: lastCheckedAt, lastFailureReason: reason, resultCount: 0, matchedCount: 0 });
        continue;
      }

      try {
        const sourceRecords = await runSource(source, options);
        records.push(...sourceRecords);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastSuccessAt: new Date(), resultCount: sourceRecords.length, matchedCount: sourceRecords.filter(isOccuMedMatch).length });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(`${source.id}: ${reason}`);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastFailureAt: new Date(), lastFailureReason: reason, resultCount: 0, matchedCount: 0 });
      }
    }

    // Second pass: search the same official portal catalog through Serper.
    // This recovers opportunity pages that a portal landing-page parser misses,
    // while keeping direct parsing authoritative and avoiding duplicate records.
    if (await statePortalsProvider.isConfigured()) {
      try {
        const discoveredPages = await statePortalsProvider.search({ keywords: options.keywords });
        const sourceById = new Map(this.sources.map((source) => [source.id, source]));
        const seen = new Set(records.map(opportunityKey));
        const discoveredRecords = statePortalsProvider.toOpportunities(discoveredPages);

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

    return { records, total: records.length, errors };
  }

'''
text = text[:start] + new_fetch + text[end:]
text = text.replace(
    '    return { name: this.name, configured: true, healthy: !statuses.some((status) => status.lastFailureAt), recordCount: statuses.reduce((sum, status) => sum + status.resultCount, 0) };',
    '    const hasCurrentFailure = statuses.some((status) => status.lastFailureAt && (!status.lastSuccessAt || status.lastFailureAt > status.lastSuccessAt));\n    return { name: this.name, configured: true, healthy: !hasCurrentFailure, recordCount: statuses.reduce((sum, status) => sum + status.resultCount, 0) };',
    1,
)
path.write_text(text)

path = Path("api-server/src/lib/search/unifiedSearch.ts")
text = path.read_text()
text = text.replace(
    'const INTEL_ONLY_PROVIDERS = new Set(["usaSpending", "federalRegister"]);\n',
    'const INTEL_ONLY_PROVIDERS = new Set(["usaSpending", "federalRegister"]);\nconst PROVIDER_ALIASES = new Map([["statePortals", "publicPortalProviders"]]);\n',
    1,
)
text = text.replace(
    '  const requestedProviders = (options.providers ?? ["samGov"]).filter((provider) => !INTEL_ONLY_PROVIDERS.has(provider));',
    '  const requestedProviders = Array.from(new Set((options.providers ?? ["samGov"]).map((provider) => PROVIDER_ALIASES.get(provider) ?? provider))).filter((provider) => !INTEL_ONLY_PROVIDERS.has(provider));',
    1,
)
text = text.replace('  // ── Web Intelligence (Serper + Exa + Tavily + Gemini + FireCrawl + State Portals) ──', '  // ── Web Intelligence (Serper + Exa + Tavily + Gemini + FireCrawl) ──', 1)
text = text.replace('"gemini", "statePortals", "exa"', '"gemini", "exa"', 1)
text = text.replace('    const useStatePortals = requestedProviders.includes("statePortals");\n', '', 1)
text = text.replace('        useStatePortals,\n', '', 1)
text = text.replace('      if (useStatePortals) result.providerResults.push({ provider: "statePortals", fetched: stats.statePortalResults, errors: errors.filter((e) => e.startsWith("State Portals")) });\n', '', 1)
path.write_text(text)

path = Path("api-server/src/lib/search/webIntelligence.ts")
text = path.read_text()
text = text.replace('import { statePortalsProvider } from "../providers/statePortals";\n', '', 1)
text = text.replace('    statePortalResults: number;\n', '', 1)
text = text.replace('  useStatePortals?: boolean;\n', '', 1)
text = text.replace('    statePortalResults: 0,\n', '', 1)
text = text.replace('  const useStatePortals = options.useStatePortals === true;\n', '', 1)
text = text.replace('    statePortalRaw,\n', '', 1)
block = '''    useStatePortals
      ? statePortalsProvider
          .search({ keywords: options.keywords })
          .catch((err: any) => {
            errors.push(`State Portals: ${err.message}`);
            return [];
          })
      : Promise.resolve([]),
'''
if block not in text:
    raise SystemExit("State portal Promise block not found")
text = text.replace(block, '', 1)
block = '''  const statePortalOpportunities =
    statePortalsProvider.toOpportunities(statePortalRaw);
  stats.statePortalResults = statePortalOpportunities.length;

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const opp of statePortalOpportunities)
    if (opp.sourceUrl) seen.add(opp.sourceUrl);
'''
if block not in text:
    raise SystemExit("State portal opportunity block not found")
text = text.replace(block, '  const seen = new Set<string>();\n  const candidates: Candidate[] = [];\n', 1)
text = text.replace('    return { opportunities: statePortalOpportunities, stats, errors };', '    return { opportunities: [], stats, errors };', 1)
text = text.replace('    opportunities: [...statePortalOpportunities, ...opportunities],', '    opportunities,', 1)
path.write_text(text)

replace_once("api-server/src/routes/opportunities.ts", '      statePortals: "statePortals",', '      statePortals: "publicPortalProviders",')
replace_once("api-server/src/routes/providers.ts", 'const INTERNAL_PUBLIC_PORTAL_ADAPTERS = new Set<RfpProviderName>(["texasEsbd", "nyScr"]);', 'const INTERNAL_PUBLIC_PORTAL_ADAPTERS = new Set<RfpProviderName>(["texasEsbd", "nyScr", "statePortals"]);')

path = Path("intel-suite/src/pages/portal/opportunities.tsx")
text = path.read_text()
text = text.replace('{ key: "statePortals", label: "State Portals", desc: "State & regional portals", stub: false },', '{ key: "publicPortalProviders", label: "Public Portal Providers", desc: "Direct parsers + Serper official-portal discovery", stub: false },', 1)
text = text.replace('"serper", "tavily", "statePortals"', '"serper", "tavily", "publicPortalProviders"', 1)
path.write_text(text)

replace_once("api-server/src/lib/search/scheduler.ts", '["samGov", "grantsGov", "statePortals", "serper", "tavily"]', '["samGov", "grantsGov", "publicPortalProviders", "serper", "tavily"]')
replace_once("render.yaml", 'samGov,grantsGov,statePortals,serper,tavily', 'samGov,grantsGov,publicPortalProviders,serper,tavily')

path = Path("api-server/src/lib/config/providerConfig.ts")
text = path.read_text()
old = 'publicPortalProviders: provider("publicPortalProviders", "Public Portal Providers", "procurement", "direct_source", [], ["Verified public procurement source catalog", "Static HTML and PDF-link extraction", "Existing Texas ESBD and NYSCR parsers", "Per-domain rate limiting"], "live", "Family 2 public procurement source catalog and runner for verified U.S. agency procurement portals."),'
new = 'publicPortalProviders: provider("publicPortalProviders", "Public Portal Providers", "procurement", "direct_source", [], ["Verified public procurement source catalog", "Direct parser and public-page extraction", "Serper official-domain discovery fallback", "Existing Texas ESBD and NYSCR parsers", "Cross-path deduplication", "Per-domain rate limiting"], "live", "Unified public procurement provider: direct parsing first, then Serper discovery across the same official portal catalog."),'
if old not in text:
    raise SystemExit("Public Portal Providers definition not found")
path.write_text(text.replace(old, new, 1))
