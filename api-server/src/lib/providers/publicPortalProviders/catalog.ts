import type { DirectRfpPortalAccessMode } from "../directRfpPortals";
import {
  ENRICHED_DIRECT_RFP_PORTALS,
  type EnrichedDirectRfpPortal,
} from "../directRfpPortalRelevanceCatalog";
import { isDeletedPortalSourceId } from "../deletedPortalPolicy";
import {
  PUBLISHED_DIRECT_RFP_PORTAL_BY_ID,
  PUBLISHED_DIRECT_RFP_PORTAL_IDS,
} from "../publishedDirectRfpCatalogue";
import { isRegisteredPublicPortalAdapter } from "../publicPortalAdapterRegistry";
import type { PortalFit } from "../portalRelevance";

export const AGENCY_TYPES = [
  "state",
  "county",
  "city",
  "fire_department",
  "fire_district",
  "ems",
  "public_safety",
  "school_district",
  "special_district",
  "public_authority",
  "transit_authority",
  "airport_authority",
  "port_authority",
] as const;

export const SOURCE_LEVELS = [
  "state",
  "county",
  "municipal",
  "district",
  "authority",
] as const;

export const SCRAPER_TYPES = [
  "static_html",
  "scrapy",
  "playwright_public",
  "rss",
  "public_json",
  "pdf_links",
  "existing_parser",
] as const;

export const VERIFICATION_STATUSES = [
  "verified",
  "needs_review",
  "broken",
] as const;

export type PublicPortalAgencyType = (typeof AGENCY_TYPES)[number];
export type PublicPortalSourceLevel = (typeof SOURCE_LEVELS)[number];
export type PublicPortalScraperType = (typeof SCRAPER_TYPES)[number];
export type PublicPortalVerificationStatus =
  (typeof VERIFICATION_STATUSES)[number];

export interface PublicPortalSource {
  id: string;
  agencyName: string;
  agencyType: PublicPortalAgencyType;
  state: string;
  county?: string;
  city?: string;
  sourceUrl: string;
  searchUrl?: string;
  domain: string;
  portalPlatform?: string;
  sourceLevel: PublicPortalSourceLevel;
  level?: EnrichedDirectRfpPortal["level"];
  accessMode?: DirectRfpPortalAccessMode;
  scraperType: PublicPortalScraperType;
  enabled: boolean;
  verificationStatus: PublicPortalVerificationStatus;
  notes?: string;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
  resultCount?: number;
  matchedCount?: number;
  occumedFit?: PortalFit;
  buyerSector?: string;
  occumedServiceCategories?: string[];
  relevanceEvidenceCount?: number;
  relevanceReasonCodes?: string[];
  lastRelevanceVerified?: string;
}

function sourceLevelFromPortal(
  portal: EnrichedDirectRfpPortal,
): PublicPortalSourceLevel {
  return portal.level === "district" ? "district" : "state";
}

function isPublishedRuntimePortal(portal: EnrichedDirectRfpPortal): boolean {
  return (
    portal.country === "US" &&
    portal.level !== "federal" &&
    PUBLISHED_DIRECT_RFP_PORTAL_IDS.has(portal.id) &&
    isRegisteredPublicPortalAdapter(portal.id) &&
    !isDeletedPortalSourceId(portal.id)
  );
}

/**
 * The public catalogue is a runtime product, not an inventory dump. Every
 * record is backed by a registered source-specific or shared-platform adapter.
 * Unadapted, login-only, blocked, disabled, and manual-only rows are omitted.
 */
export function derivePublicPortalSourcesFromDirectCatalog(
  portals: EnrichedDirectRfpPortal[] = ENRICHED_DIRECT_RFP_PORTALS,
): PublicPortalSource[] {
  return portals.filter(isPublishedRuntimePortal).flatMap((portal) => {
    const runtimePortal = PUBLISHED_DIRECT_RFP_PORTAL_BY_ID.get(portal.id);
    if (!runtimePortal) return [];
    const sourceUrl = runtimePortal.searchUrl || runtimePortal.url;
    return [
      {
        id: portal.id,
        agencyName: portal.name,
        agencyType:
          portal.level === "district" ? "special_district" : "state",
        state: runtimePortal.state ?? portal.state ?? "US",
        sourceUrl,
        searchUrl: sourceUrl,
        domain: runtimePortal.domain,
        portalPlatform: runtimePortal.name,
        sourceLevel: sourceLevelFromPortal(portal),
        level: portal.level,
        accessMode: runtimePortal.accessMode,
        scraperType: "existing_parser",
        enabled: true,
        verificationStatus: "verified",
        notes: runtimePortal.notes,
        occumedFit: portal.occumedFit,
        buyerSector: portal.buyerSector,
        occumedServiceCategories: portal.occumedServiceCategories,
        relevanceEvidenceCount: portal.relevanceEvidenceUrls.length,
        relevanceReasonCodes: portal.relevanceReasonCodes,
        lastRelevanceVerified: portal.lastRelevanceVerified,
      } satisfies PublicPortalSource,
    ];
  });
}

export const PUBLIC_PORTAL_SOURCES: PublicPortalSource[] =
  derivePublicPortalSourcesFromDirectCatalog();

function normalizeDomain(sourceUrl: string): string {
  return new URL(sourceUrl).hostname.replace(/^www\./, "").toLowerCase();
}

function validatePublicPortalUrl(
  label: "sourceUrl" | "searchUrl",
  value: string | undefined,
  expectedDomain: string | undefined,
  errors: string[],
): void {
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) {
      errors.push(`${label} must be http(s)`);
    }
    const normalizedExpectedDomain = expectedDomain
      ?.replace(/^www\./, "")
      .toLowerCase();
    const normalizedUrlDomain = parsed.hostname
      .replace(/^www\./, "")
      .toLowerCase();
    if (
      normalizedExpectedDomain &&
      normalizedUrlDomain !== normalizedExpectedDomain
    ) {
      errors.push(`${label} hostname must match domain`);
    }
  } catch {
    errors.push(`${label} must be a valid URL`);
  }
}

export function validatePublicPortalSource(
  source: PublicPortalSource,
): string[] {
  const errors: string[] = [];
  if (!source.id.trim()) errors.push("id is required");
  if (!source.agencyName.trim()) errors.push("agencyName is required");
  if (!AGENCY_TYPES.includes(source.agencyType)) {
    errors.push(`invalid agencyType: ${source.agencyType}`);
  }
  if (!SOURCE_LEVELS.includes(source.sourceLevel)) {
    errors.push(`invalid sourceLevel: ${source.sourceLevel}`);
  }
  if (!SCRAPER_TYPES.includes(source.scraperType)) {
    errors.push(`invalid scraperType: ${source.scraperType}`);
  }
  if (!VERIFICATION_STATUSES.includes(source.verificationStatus)) {
    errors.push(`invalid verificationStatus: ${source.verificationStatus}`);
  }
  if (/\s/.test(source.id)) errors.push("id must not contain whitespace");
  if (/^https?:\/\//i.test(source.domain)) {
    errors.push("domain must be a hostname, not a URL");
  }
  if (isDeletedPortalSourceId(source.id)) {
    errors.push("deleted sources cannot appear in the public catalogue");
  }
  if (!isRegisteredPublicPortalAdapter(source.id)) {
    errors.push("public catalogue sources require a registered runtime adapter");
  }
  if (!source.enabled) {
    errors.push("disabled sources must be deleted from the public catalogue");
  }
  if (source.verificationStatus !== "verified") {
    errors.push("unverified sources must not appear in the public catalogue");
  }
  if (source.scraperType !== "existing_parser") {
    errors.push("published sources must use a registered existing parser");
  }
  validatePublicPortalUrl("sourceUrl", source.sourceUrl, source.domain, errors);
  validatePublicPortalUrl("searchUrl", source.searchUrl, source.domain, errors);
  return errors;
}

export interface PublicPortalCatalogValidationSummary {
  totalDerivedSources: number;
  enabledSources: number;
  needsReviewSources: number;
  disabledLoginOrDynamicSources: number;
  duplicateIds: string[];
  invalidUrls: string[];
  aggregatorDomainLeakage: string[];
  byOccumedFit: Record<string, number>;
  withRelevanceEvidence: number;
}

export function validatePublicPortalCatalog(
  sources: PublicPortalSource[] = PUBLIC_PORTAL_SOURCES,
): PublicPortalCatalogValidationSummary {
  const ids = new Map<string, number>();
  const invalidUrls: string[] = [];
  const byOccumedFit: Record<string, number> = {};

  for (const source of sources) {
    ids.set(source.id, (ids.get(source.id) ?? 0) + 1);
    if (validatePublicPortalSource(source).length > 0) {
      invalidUrls.push(source.id);
    }
    const fit = source.occumedFit ?? "unclassified";
    byOccumedFit[fit] = (byOccumedFit[fit] ?? 0) + 1;
  }

  return {
    totalDerivedSources: sources.length,
    enabledSources: sources.length,
    needsReviewSources: 0,
    disabledLoginOrDynamicSources: 0,
    duplicateIds: [...ids.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => id),
    invalidUrls,
    aggregatorDomainLeakage: [],
    byOccumedFit,
    withRelevanceEvidence: sources.filter(
      (source) => (source.relevanceEvidenceCount ?? 0) > 0,
    ).length,
  };
}

export function publicPortalSourceFromImport(
  row: Record<string, unknown>,
): PublicPortalSource {
  const sourceUrl = String(row.sourceUrl ?? "").trim();
  const agencyName = String(row.agencyName ?? "").trim();
  const id = String(
    row.id ??
      `${String(row.state ?? "").toLowerCase()}-${agencyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")}`,
  ).trim();
  const normalizedSearchUrl =
    String(row.searchUrl ?? "").trim() || undefined;
  const domain = sourceUrl
    ? normalizeDomain(sourceUrl)
    : normalizedSearchUrl
      ? normalizeDomain(normalizedSearchUrl)
      : "";

  if (isDeletedPortalSourceId(id)) {
    throw new Error(`Deleted portal source cannot be imported: ${id}`);
  }
  if (!isRegisteredPublicPortalAdapter(id)) {
    throw new Error(`Portal source has no registered runtime adapter: ${id}`);
  }
  if (String(row.enabled ?? "true").toLowerCase() !== "true") {
    throw new Error(
      `Disabled portal source must be deleted instead of imported: ${id}`,
    );
  }

  return {
    id,
    agencyName,
    agencyType: String(row.agencyType ?? "city") as PublicPortalAgencyType,
    state: String(row.state ?? "").trim().toUpperCase(),
    county: String(row.county ?? "").trim() || undefined,
    city: String(row.city ?? "").trim() || undefined,
    sourceUrl,
    searchUrl: normalizedSearchUrl,
    domain,
    portalPlatform: String(row.portalPlatform ?? "").trim() || undefined,
    sourceLevel:
      (row.sourceLevel as PublicPortalSourceLevel) ?? "municipal",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: String(row.notes ?? "").trim() || undefined,
    occumedFit: row.occumedFit as PortalFit | undefined,
    buyerSector: String(row.buyerSector ?? "").trim() || undefined,
    occumedServiceCategories: Array.isArray(row.occumedServiceCategories)
      ? row.occumedServiceCategories.map(String)
      : undefined,
    relevanceEvidenceCount: Number(row.relevanceEvidenceCount ?? 0) || 0,
    relevanceReasonCodes: Array.isArray(row.relevanceReasonCodes)
      ? row.relevanceReasonCodes.map(String)
      : undefined,
    lastRelevanceVerified:
      String(row.lastRelevanceVerified ?? "").trim() || undefined,
  };
}
