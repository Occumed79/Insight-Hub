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
import { OPENGOV_PORTAL_IDS } from "./openGov";
import { registerOpenGovCountyExtensions } from "./openGovCountyExtensions";
import { openGovHtmlTenantProvider } from "./openGovHtml";
import { CAL_EPROCURE_SOURCE, calEprocureProvider } from "./calEprocure";
import { deepRecoveryProviders } from "./deepRecoveryProviders";
import {
  CATALOGUE_STATIC_OFFICIAL_PORTAL_IDS,
  catalogueStaticOfficialProviders,
} from "./catalogueStaticOfficialAdapters";
import {
  STATEWIDE_PORTAL_CONFIGS,
  StatewideProcurementProvider,
} from "./statewideProcurementPortals";
import {
  deletedPortalReason,
  isDeletedPortalSourceId,
} from "./deletedPortalPolicy";

registerOpenGovCountyExtensions();

const statewideProviders = new Map<string, DataSourceProvider>(
  STATEWIDE_PORTAL_CONFIGS
    .filter((config) => !isDeletedPortalSourceId(config.portalId))
    .map((config) => [
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
  ...CATALOGUE_STATIC_OFFICIAL_PORTAL_IDS,
  ...JAGGAER_COLLECTIBLE_PORTAL_IDS,
  ...BONFIRE_COLLECTIBLE_PORTAL_IDS,
  ...IONWAVE_COLLECTIBLE_PORTAL_IDS,
  ...CIVICENGAGE_PORTAL_IDS,
  ...OPENGOV_PORTAL_IDS,
  ...STATEWIDE_PORTAL_CONFIGS.map((config) => config.portalId),
]);

export function publicPortalRuntimeDisabledReason(
  sourceId: string,
): string | undefined {
  return deletedPortalReason(sourceId);
}

export function getRegisteredPublicPortalAdapter(
  sourceId: string,
): DataSourceProvider | undefined {
  if (isDeletedPortalSourceId(sourceId)) return undefined;
  if (sourceId === "tx-esbd") return texasEsbdProvider;
  if (sourceId === "ny-contract-reporter") return nyScrProvider;
  if (sourceId === CAL_EPROCURE_SOURCE.id) return calEprocureProvider;
  return (
    openGovHtmlTenantProvider(sourceId) ??
    jaggaerSciQuestTenantProvider(sourceId) ??
    bonfireTenantProvider(sourceId) ??
    ionWaveTenantProvider(sourceId) ??
    civicEngageTenantProvider(sourceId) ??
    bsoPortalProviders[sourceId] ??
    catalogueStaticOfficialProviders[sourceId] ??
    deepRecoveryProviders[sourceId] ??
    statewideProviders.get(sourceId)
  );
}

export function isRegisteredPublicPortalAdapter(sourceId: string): boolean {
  return Boolean(getRegisteredPublicPortalAdapter(sourceId));
}

export function listRegisteredPublicPortalAdapterIds(): string[] {
  return Array.from(STATIC_ADAPTER_IDS)
    .filter(
      (sourceId) =>
        !isDeletedPortalSourceId(sourceId) &&
        isRegisteredPublicPortalAdapter(sourceId),
    )
    .sort();
}
