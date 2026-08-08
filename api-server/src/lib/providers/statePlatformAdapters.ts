import type { DataSourceProvider } from "./types";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import {
  CGI_ADVANTAGE_STATE_SOURCES,
  cgiAdvantageStateProviders,
} from "./cgiAdvantageStateAdapters";
import {
  PEOPLE_SOFT_SOURCES,
  peopleSoftPublicProviders,
} from "./peopleSoftPublic";
import { kansasPeopleSoftProvider } from "./kansasPeopleSoftProvider";
import {
  PERISCOPE_SOURCES,
  periscopePublicProviders,
} from "./periscopePublic";
import {
  stateAvailabilityProviders,
  stateAvailabilitySources,
} from "./statePlatformAvailabilityRegistry";
import {
  WEBPROCURE_IVALUA_SOURCES,
  webProcureIvaluaProviders,
} from "./webProcureIvaluaPublic";

const sourceById = new Map<string, PublicPortalSource>();
for (const source of [
  ...PEOPLE_SOFT_SOURCES,
  ...WEBPROCURE_IVALUA_SOURCES,
  ...CGI_ADVANTAGE_STATE_SOURCES,
  ...PERISCOPE_SOURCES,
  ...stateAvailabilitySources,
]) sourceById.set(source.id, source);

export const STATE_PLATFORM_ADAPTER_SOURCES: PublicPortalSource[] = Array.from(sourceById.values());

export const statePlatformAdapterProviders: Record<string, DataSourceProvider> = {
  ...peopleSoftPublicProviders,
  "ks-esupplier": kansasPeopleSoftProvider,
  ...webProcureIvaluaProviders,
  ...cgiAdvantageStateProviders,
  ...periscopePublicProviders,
  ...stateAvailabilityProviders,
};
