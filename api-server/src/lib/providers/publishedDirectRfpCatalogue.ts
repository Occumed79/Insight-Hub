import {
  DIRECT_RFP_PORTALS,
  type DirectRfpPortal,
} from "./directRfpPortals";
import {
  isRegisteredPublicPortalAdapter,
  listRegisteredPublicPortalAdapterIds,
} from "./publicPortalAdapterRegistry";
import {
  getPublicPortalRuntimeMetadata,
  type PublicPortalRuntimeMetadata,
} from "./publicPortalRuntimeMetadata";

const SAM_GOV_PORTAL_ID = "us-sam-gov";

function safeHostname(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

const rawById = new Map(DIRECT_RFP_PORTALS.map((portal) => [portal.id, portal]));
const registeredAdapterIds = listRegisteredPublicPortalAdapterIds();

function buildRuntimePortal(
  portalId: string,
  metadata: PublicPortalRuntimeMetadata,
): DirectRfpPortal {
  const raw = rawById.get(portalId);
  const searchUrl = metadata.searchUrl || metadata.sourceUrl;
  return {
    id: portalId,
    name: raw?.name ?? metadata.buyerName,
    jurisdiction: raw?.jurisdiction ?? metadata.buyerName,
    state: raw?.state ?? metadata.state,
    country: raw?.country ?? metadata.country,
    level: raw?.level ?? metadata.level,
    url: metadata.sourceUrl,
    searchUrl,
    domain: metadata.domain || safeHostname(searchUrl),
    accessMode: metadata.accessMode,
    requiresKey: false,
    requiresLogin: false,
    tier: raw?.tier ?? 3,
    parserStatus: "ready_to_parse",
    notes: `${raw?.notes ?? "Official public procurement source."} Published from the registered ${metadata.adapterFamily} runtime adapter; the runtime endpoint is authoritative.`,
    occumedFit: raw?.occumedFit,
    occumedServiceCategories: raw?.occumedServiceCategories,
    relevanceReasonCodes: raw?.relevanceReasonCodes,
    relevanceEvidence: raw?.relevanceEvidence,
    relevanceEvidenceUrls: raw?.relevanceEvidenceUrls,
    lastRelevanceVerified: raw?.lastRelevanceVerified,
    buyerSector: raw?.buyerSector,
  };
}

const samGov = rawById.get(SAM_GOV_PORTAL_ID);

export const PUBLISHED_DIRECT_RFP_PORTALS: DirectRfpPortal[] = [
  ...(samGov
    ? [
        {
          ...samGov,
          parserStatus: "ready_to_parse" as const,
          requiresLogin: false,
        },
      ]
    : []),
  ...registeredAdapterIds.flatMap((portalId) => {
    const metadata = getPublicPortalRuntimeMetadata(portalId);
    return metadata ? [buildRuntimePortal(portalId, metadata)] : [];
  }),
]
  .filter(
    (portal, index, portals) =>
      portals.findIndex((candidate) => candidate.id === portal.id) === index,
  )
  .sort(
    (left, right) =>
      left.tier - right.tier ||
      left.country.localeCompare(right.country) ||
      (left.state ?? "").localeCompare(right.state ?? "") ||
      left.name.localeCompare(right.name),
  );

export const PUBLISHED_DIRECT_RFP_PORTAL_IDS = new Set(
  PUBLISHED_DIRECT_RFP_PORTALS.map((portal) => portal.id),
);

export const PUBLISHED_DIRECT_RFP_PORTAL_BY_ID = new Map(
  PUBLISHED_DIRECT_RFP_PORTALS.map((portal) => [portal.id, portal]),
);

export const REMOVED_UNRUNNABLE_DIRECT_RFP_PORTALS = DIRECT_RFP_PORTALS.filter(
  (portal) => !PUBLISHED_DIRECT_RFP_PORTAL_IDS.has(portal.id),
);

export interface PublishedCatalogueValidation {
  rawRecords: number;
  publishedRecords: number;
  removedRecords: number;
  registeredAdapters: number;
  missingSamGov: boolean;
  registeredWithoutMetadata: string[];
  registeredWithoutPublishedRecord: string[];
  publishedWithoutRuntimeAuthority: string[];
  duplicatePublishedIds: string[];
  invalidPublishedUrls: string[];
  domainMismatches: string[];
  nonReadyPublishedSources: string[];
  loginOrKeyGatedPublishedSources: string[];
  clean: boolean;
}

export function validatePublishedDirectRfpCatalogue(): PublishedCatalogueValidation {
  const counts = new Map<string, number>();
  const invalidPublishedUrls: string[] = [];
  const domainMismatches: string[] = [];

  for (const portal of PUBLISHED_DIRECT_RFP_PORTALS) {
    counts.set(portal.id, (counts.get(portal.id) ?? 0) + 1);
    const effectiveUrl = portal.searchUrl || portal.url;
    try {
      const parsed = new URL(effectiveUrl);
      if (!/^https?:$/.test(parsed.protocol)) invalidPublishedUrls.push(portal.id);
      if (
        parsed.hostname.replace(/^www\./, "").toLowerCase() !==
        portal.domain.replace(/^www\./, "").toLowerCase()
      ) {
        domainMismatches.push(portal.id);
      }
    } catch {
      invalidPublishedUrls.push(portal.id);
    }
  }

  const registeredWithoutMetadata = registeredAdapterIds.filter(
    (portalId) => !getPublicPortalRuntimeMetadata(portalId),
  );
  const registeredWithoutPublishedRecord = registeredAdapterIds.filter(
    (portalId) => !PUBLISHED_DIRECT_RFP_PORTAL_IDS.has(portalId),
  );
  const publishedWithoutRuntimeAuthority = PUBLISHED_DIRECT_RFP_PORTALS.filter(
    (portal) =>
      portal.id !== SAM_GOV_PORTAL_ID &&
      !isRegisteredPublicPortalAdapter(portal.id),
  ).map((portal) => portal.id);
  const duplicatePublishedIds = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([portalId]) => portalId);
  const nonReadyPublishedSources = PUBLISHED_DIRECT_RFP_PORTALS.filter(
    (portal) => portal.parserStatus !== "ready_to_parse",
  ).map((portal) => portal.id);
  const loginOrKeyGatedPublishedSources = PUBLISHED_DIRECT_RFP_PORTALS.filter(
    (portal) =>
      portal.requiresLogin ||
      (portal.id !== SAM_GOV_PORTAL_ID && portal.requiresKey),
  ).map((portal) => portal.id);
  const missingSamGov = !PUBLISHED_DIRECT_RFP_PORTAL_IDS.has(SAM_GOV_PORTAL_ID);

  const clean =
    !missingSamGov &&
    registeredWithoutMetadata.length === 0 &&
    registeredWithoutPublishedRecord.length === 0 &&
    publishedWithoutRuntimeAuthority.length === 0 &&
    duplicatePublishedIds.length === 0 &&
    invalidPublishedUrls.length === 0 &&
    domainMismatches.length === 0 &&
    nonReadyPublishedSources.length === 0 &&
    loginOrKeyGatedPublishedSources.length === 0;

  return {
    rawRecords: DIRECT_RFP_PORTALS.length,
    publishedRecords: PUBLISHED_DIRECT_RFP_PORTALS.length,
    removedRecords: REMOVED_UNRUNNABLE_DIRECT_RFP_PORTALS.length,
    registeredAdapters: registeredAdapterIds.length,
    missingSamGov,
    registeredWithoutMetadata,
    registeredWithoutPublishedRecord,
    publishedWithoutRuntimeAuthority,
    duplicatePublishedIds,
    invalidPublishedUrls,
    domainMismatches,
    nonReadyPublishedSources,
    loginOrKeyGatedPublishedSources,
    clean,
  };
}
