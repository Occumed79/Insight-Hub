import type { DataSourceProvider } from "./types";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import { isDeletedPortalSourceId } from "./deletedPortalPolicy";
import {
  KENTUCKY_CGI_ADVANTAGE_SOURCE,
  MICHIGAN_CGI_ADVANTAGE_SOURCE,
  kentuckyCgiAdvantageProvider,
  michiganCgiAdvantageProvider,
} from "./cgiAdvantagePublic";
import { GEORGIA_GAWORK_SOURCE, georgiaGaworkProvider } from "./georgiaGawork";
import { HAWAII_HANDS_SOURCE, hawaiiHandsProvider } from "./hawaiiHands";
import {
  MINNESOTA_OSP_SOURCE,
  minnesotaOspProvider,
} from "./minnesotaOsp";
import {
  NEW_HAMPSHIRE_BIDS_SOURCE,
  newHampshireBidsProvider,
} from "./newHampshireBids";
import {
  PRODUCTION_RECOVERY_SOURCES,
  productionRecoveryProviders,
} from "./productionSourceRecovery";
import {
  STATE_PLATFORM_ADAPTER_SOURCES,
  statePlatformAdapterProviders,
} from "./statePlatformAdapters";
import {
  SOUTH_DAKOTA_POSTING_BOARD_SOURCE,
  southDakotaPostingBoardProvider,
} from "./southDakotaPostingBoard";

const sourceById = new Map<string, PublicPortalSource>();
for (const source of [
  GEORGIA_GAWORK_SOURCE,
  HAWAII_HANDS_SOURCE,
  KENTUCKY_CGI_ADVANTAGE_SOURCE,
  MICHIGAN_CGI_ADVANTAGE_SOURCE,
  NEW_HAMPSHIRE_BIDS_SOURCE,
  SOUTH_DAKOTA_POSTING_BOARD_SOURCE,
  ...STATE_PLATFORM_ADAPTER_SOURCES,
  MINNESOTA_OSP_SOURCE,
  ...PRODUCTION_RECOVERY_SOURCES,
]) {
  if (!isDeletedPortalSourceId(source.id) && source.enabled !== false) {
    sourceById.set(source.id, source);
  }
}

export const DEEP_RECOVERY_SOURCES: PublicPortalSource[] = Array.from(
  sourceById.values(),
);

const providerEntries: Array<[string, DataSourceProvider]> = [
  [GEORGIA_GAWORK_SOURCE.id, georgiaGaworkProvider],
  [HAWAII_HANDS_SOURCE.id, hawaiiHandsProvider],
  [KENTUCKY_CGI_ADVANTAGE_SOURCE.id, kentuckyCgiAdvantageProvider],
  [MICHIGAN_CGI_ADVANTAGE_SOURCE.id, michiganCgiAdvantageProvider],
  [NEW_HAMPSHIRE_BIDS_SOURCE.id, newHampshireBidsProvider],
  [SOUTH_DAKOTA_POSTING_BOARD_SOURCE.id, southDakotaPostingBoardProvider],
  ...Object.entries(statePlatformAdapterProviders),
  [MINNESOTA_OSP_SOURCE.id, minnesotaOspProvider],
  ...Object.entries(productionRecoveryProviders),
];

export const deepRecoveryProviders: Record<string, DataSourceProvider> =
  Object.fromEntries(
    providerEntries.filter(([sourceId]) => !isDeletedPortalSourceId(sourceId)),
  );
