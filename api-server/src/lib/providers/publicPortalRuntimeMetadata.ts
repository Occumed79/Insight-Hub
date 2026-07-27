import type {
  DirectRfpPortalAccessMode,
  DirectRfpPortalLevel,
} from "./directRfpPortals";
import { BONFIRE_COLLECTIBLE_PORTAL_IDS, BONFIRE_TENANTS } from "./bonfirePortal";
import { CAL_EPROCURE_SOURCE } from "./calEprocure";
import { CATALOGUE_STATIC_OFFICIAL_TENANTS } from "./catalogueStaticOfficialAdapters";
import { CIVICENGAGE_TENANTS } from "./civicEngageBids";
import { DEEP_RECOVERY_SOURCES } from "./deepRecoveryProviders";
import {
  JAGGAER_COLLECTIBLE_PORTAL_IDS,
  JAGGAER_SCIQUEST_TENANTS,
} from "./jaggaerSciQuest";
import { IONWAVE_COLLECTIBLE_PORTAL_IDS, IONWAVE_TENANTS } from "./ionWavePortal";
import { OPENGOV_PORTAL_IDS, OPENGOV_TENANTS } from "./openGov";
import { STATEWIDE_PORTAL_CONFIGS } from "./statewideProcurementPortals";

export interface PublicPortalRuntimeMetadata {
  portalId: string;
  buyerName: string;
  state?: string;
  country: string;
  level: DirectRfpPortalLevel;
  sourceUrl: string;
  searchUrl: string;
  domain: string;
  accessMode: DirectRfpPortalAccessMode;
  adapterFamily: string;
}

interface PrioritizedMetadata extends PublicPortalRuntimeMetadata {
  priority: number;
}

const metadataById = new Map<string, PrioritizedMetadata>();

function hostname(value: string): string {
  return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
}

function register(
  metadata: Omit<PublicPortalRuntimeMetadata, "domain"> & { domain?: string },
  priority: number,
): void {
  const existing = metadataById.get(metadata.portalId);
  if (existing && existing.priority > priority) return;
  metadataById.set(metadata.portalId, {
    ...metadata,
    domain: metadata.domain ?? hostname(metadata.searchUrl || metadata.sourceUrl),
    priority,
  });
}

for (const config of STATEWIDE_PORTAL_CONFIGS) {
  register(
    {
      portalId: config.portalId,
      buyerName: config.buyerName,
      state: config.state,
      country: "US",
      level: "state",
      sourceUrl: config.listingUrl,
      searchUrl: config.listingUrl,
      accessMode: "public_html",
      adapterFamily: `statewide:${config.platformFamily}`,
    },
    10,
  );
}

for (const source of DEEP_RECOVERY_SOURCES) {
  const sourceUrl = source.searchUrl || source.sourceUrl;
  register(
    {
      portalId: source.id,
      buyerName: source.agencyName,
      state: source.state,
      country: "US",
      level: source.level ?? (source.sourceLevel === "state" ? "state" : "district"),
      sourceUrl,
      searchUrl: sourceUrl,
      domain: source.domain,
      accessMode: source.accessMode ?? "public_html",
      adapterFamily: "deep-recovery",
    },
    20,
  );
}

for (const tenant of CATALOGUE_STATIC_OFFICIAL_TENANTS) {
  const listingUrl = tenant.urls[0];
  if (!listingUrl) continue;
  register(
    {
      portalId: tenant.portalId,
      buyerName: tenant.buyerName,
      state: tenant.state,
      country: "US",
      level: "district",
      sourceUrl: listingUrl,
      searchUrl: listingUrl,
      accessMode: "public_html",
      adapterFamily: "static-official",
    },
    30,
  );
}

for (const tenant of CIVICENGAGE_TENANTS) {
  register(
    {
      portalId: tenant.portalId,
      buyerName: tenant.buyerName,
      state: tenant.state,
      country: "US",
      level: "district",
      sourceUrl: tenant.listingUrl,
      searchUrl: tenant.listingUrl,
      accessMode: "public_html",
      adapterFamily: "civicengage",
    },
    40,
  );
}

for (const tenant of OPENGOV_TENANTS) {
  if (!OPENGOV_PORTAL_IDS.has(tenant.portalId)) continue;
  const searchUrl = `https://procurement.opengov.com/api/v2/portal/${tenant.tenantSlug}/projects?status=open`;
  register(
    {
      portalId: tenant.portalId,
      buyerName: tenant.buyerName,
      state: tenant.state,
      country: "US",
      level: "district",
      sourceUrl: searchUrl,
      searchUrl,
      accessMode: "api",
      adapterFamily: "opengov",
    },
    40,
  );
}

for (const tenant of JAGGAER_SCIQUEST_TENANTS) {
  if (!JAGGAER_COLLECTIBLE_PORTAL_IDS.has(tenant.portalId)) continue;
  register(
    {
      portalId: tenant.portalId,
      buyerName: tenant.buyerName,
      state: tenant.state,
      country: tenant.country,
      level: tenant.country === "US" ? "state" : "international",
      sourceUrl: tenant.listingUrl,
      searchUrl: tenant.listingUrl,
      accessMode: "public_html",
      adapterFamily: "jaggaer-sciquest",
    },
    40,
  );
}

for (const tenant of BONFIRE_TENANTS) {
  if (!BONFIRE_COLLECTIBLE_PORTAL_IDS.has(tenant.portalId)) continue;
  register(
    {
      portalId: tenant.portalId,
      buyerName: tenant.buyerName,
      state: tenant.state,
      country: "US",
      level: "district",
      sourceUrl: tenant.listingUrl,
      searchUrl: tenant.listingUrl,
      accessMode: "api",
      adapterFamily: "bonfire-euna",
    },
    40,
  );
}

for (const tenant of IONWAVE_TENANTS) {
  if (!IONWAVE_COLLECTIBLE_PORTAL_IDS.has(tenant.portalId)) continue;
  register(
    {
      portalId: tenant.portalId,
      buyerName: tenant.buyerName,
      state: tenant.state,
      country: "US",
      level: "district",
      sourceUrl: tenant.listingUrl,
      searchUrl: tenant.listingUrl,
      accessMode: "public_html",
      adapterFamily: "ionwave",
    },
    40,
  );
}

for (const entry of [
  {
    portalId: "ma-commbuys",
    buyerName: "Massachusetts COMMBUYS",
    state: "MA",
    root: "https://www.commbuys.com/bso/",
  },
  {
    portalId: "nv-epro",
    buyerName: "NevadaEPro",
    state: "NV",
    root: "https://nevadaepro.com/bso/",
  },
  {
    portalId: "nj-start",
    buyerName: "New Jersey START",
    state: "NJ",
    root: "https://www.njstart.gov/bso/",
  },
] as const) {
  const searchUrl = new URL(
    "view/search/external/advancedSearchBid.xhtml?openBids=true",
    entry.root,
  ).toString();
  register(
    {
      portalId: entry.portalId,
      buyerName: entry.buyerName,
      state: entry.state,
      country: "US",
      level: "state",
      sourceUrl: searchUrl,
      searchUrl,
      accessMode: "public_html",
      adapterFamily: "periscope-bso",
    },
    50,
  );
}

register(
  {
    portalId: "tx-esbd",
    buyerName: "Texas ESBD / Texas SmartBuy",
    state: "TX",
    country: "US",
    level: "state",
    sourceUrl: "https://www.txsmartbuy.gov/esbd",
    searchUrl: "https://www.txsmartbuy.gov/esbd",
    accessMode: "csv",
    adapterFamily: "texas-esbd",
  },
  60,
);

register(
  {
    portalId: "ny-contract-reporter",
    buyerName: "New York State Contract Reporter",
    state: "NY",
    country: "US",
    level: "state",
    sourceUrl: "https://www.nyscr.ny.gov/contracts.cfm",
    searchUrl: "https://www.nyscr.ny.gov/contracts.cfm",
    accessMode: "public_html",
    adapterFamily: "ny-contract-reporter",
  },
  60,
);

register(
  {
    portalId: CAL_EPROCURE_SOURCE.id,
    buyerName: CAL_EPROCURE_SOURCE.agencyName,
    state: CAL_EPROCURE_SOURCE.state,
    country: "US",
    level: "state",
    sourceUrl: CAL_EPROCURE_SOURCE.sourceUrl,
    searchUrl: CAL_EPROCURE_SOURCE.searchUrl || CAL_EPROCURE_SOURCE.sourceUrl,
    domain: CAL_EPROCURE_SOURCE.domain,
    accessMode: CAL_EPROCURE_SOURCE.accessMode ?? "public_html",
    adapterFamily: "cal-eprocure",
  },
  60,
);

export const PUBLIC_PORTAL_RUNTIME_METADATA_BY_ID = new Map(
  [...metadataById.entries()].map(([portalId, metadata]) => {
    const { priority: _priority, ...publicMetadata } = metadata;
    return [portalId, publicMetadata] as const;
  }),
);

export function getPublicPortalRuntimeMetadata(
  portalId: string,
): PublicPortalRuntimeMetadata | undefined {
  return PUBLIC_PORTAL_RUNTIME_METADATA_BY_ID.get(portalId);
}

export function listPublicPortalRuntimeMetadataIds(): string[] {
  return [...PUBLIC_PORTAL_RUNTIME_METADATA_BY_ID.keys()].sort();
}
