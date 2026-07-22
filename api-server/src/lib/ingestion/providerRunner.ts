import { providerRegistry } from "../providers";
import type { NormalizedOpportunity } from "../providers/types";
import { webIntelligenceFetch } from "../search/webIntelligence";

export const PROVIDER_ALIASES = new Map<string, string>([
  ["sam_gov", "samGov"],
  ["public_portal_providers", "publicPortalProviders"],
  ["publicPortals", "publicPortalProviders"],
  ["public_portals", "publicPortalProviders"],
  ["statePortals", "publicPortalProviders"],
  ["euna_bonfire", "eunaBonfire"],
  ["eunaSupplierNetwork", "eunaBonfire"],
  ["international_public_portals", "internationalPublicPortals"],
  ["internationalOpportunities", "internationalPublicPortals"],
]);

export const MANUAL_RFP_PROVIDERS = new Set([
  "samGov",
  "publicPortalProviders",
  "eunaBonfire",
  "internationalPublicPortals",
  "tango",
  "bidnet",
  "serper",
  "tavily",
  "exa",
]);

const WEB_DISCOVERY_PROVIDERS = new Set(["serper", "tavily", "exa"]);

export interface ProviderRunResult {
  records: NormalizedOpportunity[];
  errors: string[];
}

export function resolveManualProviders(providers?: string[]): string[] {
  const resolved = Array.from(
    new Set(
      (providers?.length ? providers : ["samGov"]).map(
        (provider) => PROVIDER_ALIASES.get(provider) ?? provider,
      ),
    ),
  );
  const unsupported = resolved.filter(
    (provider) => !MANUAL_RFP_PROVIDERS.has(provider),
  );
  if (unsupported.length > 0)
    throw new Error(`Unsupported RFP provider(s): ${unsupported.join(", ")}`);
  return resolved;
}

export async function fetchOneProvider(
  provider: string,
  options: { keywords?: string; dateRange?: number; signal?: AbortSignal },
): Promise<ProviderRunResult> {
  if (WEB_DISCOVERY_PROVIDERS.has(provider)) {
    const result = await webIntelligenceFetch({
      keywords: options.keywords,
      useSerper: provider === "serper",
      useTavily: provider === "tavily",
      useExa: provider === "exa",
    });
    return {
      records: result.opportunities.filter(
        (record) => record.source === provider,
      ),
      errors: result.errors,
    };
  }

  const source = providerRegistry[provider as keyof typeof providerRegistry];
  if (!source) throw new Error(`Unknown RFP provider: ${provider}`);
  const result = await source.fetch({
    keywords: options.keywords,
    dateRange: options.dateRange,
    limit: 100,
    signal: options.signal,
  });
  return { records: result.records, errors: result.errors ?? [] };
}
