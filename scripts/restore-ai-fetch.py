from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


runner_path = Path("api-server/src/lib/ingestion/providerRunner.ts")
runner = runner_path.read_text()
runner = replace_once(
    runner,
    '''export const PROVIDER_ALIASES = new Map<string, string>([
  ["sam_gov", "samGov"],
  ["public_portal_providers", "publicPortalProviders"],
  ["publicPortals", "publicPortalProviders"],
  ["public_portals", "publicPortalProviders"],
  ["statePortals", "publicPortalProviders"],
  ["euna_bonfire", "eunaBonfire"],
  ["eunaSupplierNetwork", "eunaBonfire"],
  ["international_public_portals", "internationalPublicPortals"],
  ["internationalOpportunities", "internationalPublicPortals"],
]);''',
    '''export const PROVIDER_ALIASES = new Map<string, string>([
  ["sam_gov", "samGov"],
  ["ai_discovery", "aiDiscovery"],
  ["webIntelligence", "aiDiscovery"],
  ["public_portal_providers", "aiDiscovery"],
  ["publicPortals", "aiDiscovery"],
  ["public_portals", "aiDiscovery"],
  ["statePortals", "aiDiscovery"],
  ["euna_bonfire", "aiDiscovery"],
  ["eunaSupplierNetwork", "aiDiscovery"],
  ["international_public_portals", "aiDiscovery"],
  ["internationalOpportunities", "aiDiscovery"],
]);''',
    "provider aliases",
)
runner, count = re.subn(
    r'export const MANUAL_RFP_PROVIDERS = new Set\(\[.*?\n\]\);',
    '''export const MANUAL_RFP_PROVIDERS = new Set([
  "samGov",
  "aiDiscovery",
]);''',
    runner,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"manual providers: expected one match, found {count}")
runner = replace_once(
    runner,
    '(providers?.length ? providers : ["samGov"]).map(',
    '(providers?.length ? providers : ["samGov", "aiDiscovery"]).map(',
    "default providers",
)
old_guard = '''  const admitted =
    provider === "publicPortalProviders"
      ? records
      : (() => {
          const partition = partitionProviderRecordsForQuery(records, keywords, 3);
          if (partition.rejectedCount > 0) {
            console.info(
              JSON.stringify({
                event: "rfp_provider_query_partitioned",
                provider,
                query: keywords,
                returned: partition.rawCount,
                matched: partition.matchedCount,
                rejected: partition.rejectedCount,
                retainedRejectionSamples: partition.rejectedSamples.length,
              }),
            );
          }
          return [...partition.matched, ...partition.rejectedSamples];
        })();'''
new_guard = '''  const partition = partitionProviderRecordsForQuery(records, keywords, 3);
  if (partition.rejectedCount > 0) {
    console.info(
      JSON.stringify({
        event: "rfp_provider_query_partitioned",
        provider,
        query: keywords,
        returned: partition.rawCount,
        matched: partition.matchedCount,
        rejected: partition.rejectedCount,
        retainedRejectionSamples: partition.rejectedSamples.length,
      }),
    );
  }
  const admitted = [...partition.matched, ...partition.rejectedSamples];'''
runner = replace_once(runner, old_guard, new_guard, "provider guards")
runner = runner.replace('\nconst DIRECT_RESULT_SHARE = 0.7;\n', '\n', 1)
runner, count = re.subn(
    r'\nfunction recordKey\(record: NormalizedOpportunity\): string \{.*?\n\}\n\nfunction mergeDirectAndDiscovery\(.*?\n\}\n',
    '\n',
    runner,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"direct/discovery merge removal: expected one match, found {count}")
runner = runner.replace('[publicPortalProviders:ai-discovery]', '[aiDiscovery]')
runner = runner.replace('event: "public_portal_ai_discovery"', 'event: "ai_opportunity_discovery"')
marker = '''export async function fetchOneProvider(
  provider: string,
  options: ProviderRunnerOptions,
): Promise<ProviderRunResult> {
'''
runner = replace_once(
    runner,
    marker,
    marker + '''  if (provider === "aiDiscovery") {
    const records = await fetchConfiguredAiDiscovery(options);
    return applyProviderGuards(provider, records, [], options.keywords);
  }

''',
    "ai discovery provider",
)
runner, count = re.subn(
    r'\n  if \(provider === "publicPortalProviders"\) \{.*?\n  \}\n\n  const result = await source\.fetch',
    '\n  const result = await source.fetch',
    runner,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"public portal execution removal: expected one match, found {count}")
runner_path.write_text(runner)

manual_path = Path("api-server/src/lib/ingestion/manualIngestion.ts")
manual = manual_path.read_text()
marker = 'function conciseError(value: unknown): string {\n'
manual = replace_once(
    manual,
    marker,
    '''function providerDisplayName(provider: string): string {
  if (provider === "aiDiscovery") return "AI Opportunity Discovery";
  if (provider === "samGov") return "SAM.gov Official API";
  return provider;
}

''' + marker,
    "provider display helper",
)
manual = replace_once(manual, '  let progressMessage = `Still waiting for ${provider}`;', '  let progressMessage = `Still waiting for ${providerDisplayName(provider)}`;', "progress label")
manual = replace_once(manual, '            statusMessage: `Running ${source.provider}`,', '            statusMessage: `Running ${providerDisplayName(source.provider)}`,', "running label")
manual = replace_once(manual, '            statusMessage: `${source.provider} ${sourceStatus}`,', '            statusMessage: `${providerDisplayName(source.provider)} ${sourceStatus}`,', "completed label")
manual_path.write_text(manual)

ui_path = Path("intel-suite/src/pages/portal/opportunities.tsx")
ui = ui_path.read_text()
ui = replace_once(ui, 'import { ProcurementPortalDirectory } from "@/components/portal/ProcurementPortalDirectory";\n', '', "remove portal directory import")
start = ui.index('const FETCH_PROVIDER_GROUPS:')
end = ui.index('\n\ntype IngestionRun', start)
ui = ui[:start] + '''const FETCH_PROVIDER_GROUPS: { id: string; label: string; options: FetchProviderOption[] }[] = [
  {
    id: "ai_intelligence",
    label: "AI Intelligence",
    options: [
      {
        key: "aiDiscovery",
        label: "AI Opportunity Discovery",
        desc: "Gemini-guided discovery using configured Serper, Exa, and LangSearch services",
        stub: false,
      },
      {
        key: "sam_gov",
        label: "SAM.gov Official API",
        desc: "Official federal solicitations added alongside AI discovery",
        stub: false,
      },
    ],
  },
];''' + ui[end:]
ui = replace_once(ui, 'const [fetchProviders, setFetchProviders] = useState<string[]>(["sam_gov", "publicPortalProviders", "eunaBonfire", "internationalPublicPortals"]);', 'const [fetchProviders, setFetchProviders] = useState<string[]>(["aiDiscovery", "sam_gov"]);', "AI fetch defaults")
ui = replace_once(ui, '      <ProcurementPortalDirectory />\n\n', '', "remove scraper directory")
ui = replace_once(ui, 'providersData?.providers.filter((p) => p.ingestionEligible).map((p) => {', 'providersData?.providers.filter((p) => p.ingestionEligible && !["publicPortalProviders", "eunaBonfire", "internationalPublicPortals", "tango", "bidnet"].includes(p.name)).map((p) => {', "hide scraper filters")
ui = replace_once(ui, '"Choose official opportunity sources and, when needed, optional web-discovery services."', '"Run the AI-led opportunity discovery system. It searches broadly, validates relevance, and optionally adds official SAM.gov notices. Portal scraping is disabled."', "fetch description")
ui = replace_once(ui, '{currentRun.currentProvider}</span></p>}', '{currentRun.currentProvider === "aiDiscovery" ? "AI Opportunity Discovery" : currentRun.currentProvider === "samGov" ? "SAM.gov Official API" : currentRun.currentProvider}</span></p>}', "current provider label")
ui_path.write_text(ui)

test_path = Path("api-server/src/lib/ingestion/__tests__/providerRunner.test.ts")
test_path.write_text('''import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { MANUAL_RFP_PROVIDERS, resolveManualProviders } = await import("../providerRunner");

test("manual Fetch Intelligence defaults to official SAM plus one AI discovery pass", () => {
  assert.deepEqual(resolveManualProviders(), ["samGov", "aiDiscovery"]);
  assert.deepEqual(Array.from(MANUAL_RFP_PROVIDERS), ["samGov", "aiDiscovery"]);
});

test("legacy scraper selections collapse into the AI discovery provider", () => {
  assert.deepEqual(
    resolveManualProviders(["sam_gov", "publicPortalProviders", "eunaBonfire", "internationalPublicPortals"]),
    ["samGov", "aiDiscovery"],
  );
});

test("direct scraper providers are no longer runnable through manual ingestion", () => {
  assert.throws(() => resolveManualProviders(["tango"]), /Unsupported RFP provider/);
});
''')

for temporary in [
    Path(".github/workflows/apply-ai-fetch-hotfix.yml"),
    Path(".github/workflows/apply-ai-fetch-hotfix-pr.yml"),
    Path("docs/ai-fetch-restoration-trigger.md"),
    Path("scripts/restore-ai-fetch.py"),
]:
    if temporary.exists():
        temporary.unlink()
