import type { DataSourceProvider } from "./types";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import { GEORGIA_GAWORK_SOURCE, georgiaGaworkProvider } from "./georgiaGawork";
import { HAWAII_HANDS_SOURCE, hawaiiHandsProvider } from "./hawaiiHands";
import { MINNESOTA_OSP_SOURCE, minnesotaOspProvider } from "./minnesotaOsp";
import { OREGON_BUYS_SOURCE, oregonBuysProvider } from "./oregonBuys";
import {
  SOUTH_DAKOTA_POSTING_BOARD_SOURCE,
  southDakotaPostingBoardProvider,
} from "./southDakotaPostingBoard";

export const DEEP_RECOVERY_SOURCES: PublicPortalSource[] = [
  GEORGIA_GAWORK_SOURCE,
  HAWAII_HANDS_SOURCE,
  MINNESOTA_OSP_SOURCE,
  OREGON_BUYS_SOURCE,
  SOUTH_DAKOTA_POSTING_BOARD_SOURCE,
];

export const deepRecoveryProviders: Record<string, DataSourceProvider> = {
  [GEORGIA_GAWORK_SOURCE.id]: georgiaGaworkProvider,
  [HAWAII_HANDS_SOURCE.id]: hawaiiHandsProvider,
  [MINNESOTA_OSP_SOURCE.id]: minnesotaOspProvider,
  [OREGON_BUYS_SOURCE.id]: oregonBuysProvider,
  [SOUTH_DAKOTA_POSTING_BOARD_SOURCE.id]: southDakotaPostingBoardProvider,
};
