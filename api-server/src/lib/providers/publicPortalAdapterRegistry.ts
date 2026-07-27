import type { DataSourceProvider } from "./types";
import { texasEsbdProvider } from "./texasEsbd";
import { nyScrProvider } from "./nyScr";
import { bsoPortalProviders } from "./bsoPortal";
import {
  jaggaerSciQuestTenantProvider,
  JAGGAER_COLLECTIBLE_PORTAL_IDS,
} from "./jaggaerSciQuest";
import {
  bonfireTenantProvider,
  BONFIRE_COLLECTIBLE_PORTAL_IDS,
} from "./bonfirePortal";
import {
  ionWaveTenantProvider,
  IONWAVE_COLLECTIBLE_PORTAL_IDS,
} from "./ionWavePortal";
import {
  civicEngageTenantProvider,
  CIVICENGAGE_PORTAL_IDS,
} from "./civicEngageBids";
import { openGovTenantProvider, OPENGOV_PORTAL_IDS } from "./openGov";
import { CAL_EPROCURE_SOURCE, calEprocureProvider } from "./calEprocure";
import { deepRecoveryProviders } from "./deepRecoveryProviders";
import {
  STATEWIDE_PORTAL_CONFIGS,
  StatewideProcurementProvider,
} from "./statewideProcurementPortals";
import { manualOnlyPortalReason } from "./manualOnlyPortalPolicy";
import { PLANETBIDS_WAF_BLOCKED_PORTAL_IDS } from "./planetBidsAccessPolicy";

const PUBLIC_PURCHASE_MANUAL_ONLY_IDS = new Set([
  "wy-state-purchasing",
  "ca-calaveras-county",
]);

const statewideProviders = new Map<string, DataSourceProvider>(
  STATEWIDE_PORTAL_CONFIGS.map((config) => [
    config.portalId,
    new StatewideProcurementProvider(config),
  ]),
);

const STATIC_ADAPTER_IDS = new Set<string>([
  "tx-esbd",
  "ny-contract-reporter",
  CAL_EPROCURE_SOURCE.id,
  ...Object.keys(bsoPortalProviders),
  ...Object.keys(deepRecoveryProviders),
  ...JAGGAER_COLLECTIBLE_PORTAL_IDS,
  ...BONFIRE_COLLECTIBLE_PORTAL_IDS,
  ...IONWAVE_COLLECTIBLE_PORTAL_IDS,
  ...CIVICENGAGE_PORTAL_IDS,
  ...OPENGOV_PORTAL_IDS,
  ...STATEWIDE_PORTAL_CONFIGS.map((config) => config.portalId),
]);

/**
 * Runtime policy restrictions override registration. A catalog row, stale
 * adapter entry, or URL can never make one of these sources executable.
 */
export function publicPortalRuntimeDisabledReason(
  sourceId: string,
): string | undefined {
  const manualOnly = manualOnlyPortalReason(sourceId);
  if (manualOnly) return manualOnly;
  if (PUBLIC_PURCHASE_MANUAL_ONLY_IDS.has(sourceId)) {
    return "Authenticated Public Purchase vendor access is required; this source remains manual-only.";
  }
  if (PLANETBIDS_WAF_BLOCKED_PORTAL_IDS.has(sourceId)) {
    return "Browser/WAF-restricted source retained for manual directory access only.";
  }
  return undefined;
}

/**
 * The adapter registry is the sole authority for source-specific collection.
 * Catalog metadata such as URL, accessMode, parserStatus, or enabled cannot
 * create an adapter and is deliberately ignored here.
 */
export function getRegisteredPublicPortalAdapter(
  sourceId: string,
): DataSourceProvider | undefined {
  if (publicPortalRuntimeDisabledReason(sourceId)) return undefined;
  if (sourceId === "tx-esbd") return texasEsbdProvider;
  if (sourceId === "ny-contract-reporter") return nyScrProvider;
  if (sourceId === CAL_EPROCURE_SOURCE.id) return calEprocureProvider;
  return (
    deepRecoveryProviders[sourceId] ??
    bsoPortalProviders[sourceId] ??
    jaggaerSciQuestTenantProvider(sourceId) ??
    bonfireTenantProvider(sourceId) ??
    ionWaveTenantProvider(sourceId) ??
    civicEngageTenantProvider(sourceId) ??
    openGovTenantProvider(sourceId) ??
    statewideProviders.get(sourceId)
  );
}

export function isRegisteredPublicPortalAdapter(sourceId: string): boolean {
  return Boolean(getRegisteredPublicPortalAdapter(sourceId));
}

export function listRegisteredPublicPortalAdapterIds(): string[] {
  return Array.from(STATIC_ADAPTER_IDS)
    .filter((sourceId) => isRegisteredPublicPortalAdapter(sourceId))
    .sort();
}
