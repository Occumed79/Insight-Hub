import type { DirectRfpPortalAccessMode } from "../directRfpPortals";
import {
  ENRICHED_DIRECT_RFP_PORTALS,
  type EnrichedDirectRfpPortal,
} from "../directRfpPortalRelevanceCatalog";
import { registerOpenGovCountyExtensions } from "../openGovCountyExtensions";
import type { PortalFit } from "../portalRelevance";

registerOpenGovCountyExtensions();

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

const AGGREGATOR_DOMAIN_PATTERNS = [
  "bidnet",
  "demandstar",
  "govwin",
  "planetbids",
  "opengov",
  "periscope",
  "s2g",
];

function isAggregatorDomain(domain: string): boolean {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  return AGGREGATOR_DOMAIN_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

function isSafeDirectPortal(portal: EnrichedDirectRfpPortal): boolean {
  return (
    portal.country === "US" &&
    portal.level !== "federal" &&
    !portal.requiresLogin &&
    !portal.requiresKey &&
    !isAggregatorDomain(portal.domain)
  );
}

function sourceLevelFromPortal(
  portal: EnrichedDirectRfpPortal,
): PublicPortalSourceLevel {
  if (portal.level === "district") return "district";
  return "state";
}

function scraperTypeFromAccessMode(
  accessMode: DirectRfpPortalAccessMode,
): PublicPortalScraperType {
  if (accessMode === "public_html") return "static_html";
  if (accessMode === "csv") return "static_html";
  if (accessMode === "api") return "public_json";
  return "playwright_public";
}

export function derivePublicPortalSourcesFromDirectCatalog(
  portals: EnrichedDirectRfpPortal[] = ENRICHED_DIRECT_RFP_PORTALS,
): PublicPortalSource[] {
  return portals.filter(isSafeDirectPortal).map((portal) => {
    const sourceUrl = portal.searchUrl || portal.url;
    const enabled =
      portal.country === "US" &&
      portal.level !== "federal" &&
      !portal.requiresLogin &&
      !portal.requiresKey &&
      Boolean(sourceUrl) &&
      !isAggregatorDomain(portal.domain) &&
      (portal.accessMode === "public_html" ||
        portal.accessMode === "csv" ||
        portal.accessMode === "api");
    return {
      id: portal.id,
      agencyName: portal.name,
      agencyType:
        portal.level === "district" ? "special_district" : "state",
      state: portal.state ?? "US",
      sourceUrl,
      searchUrl: portal.searchUrl,
      domain: portal.domain,
      portalPlatform: portal.name,
      sourceLevel: sourceLevelFromPortal(portal),
      level: portal.level,
      accessMode: portal.accessMode,
      scraperType: scraperTypeFromAccessMode(portal.accessMode),
      enabled,
      verificationStatus: enabled ? "verified" : "needs_review",
      notes: `${portal.notes} Derived from directRfpPortals; accessMode=${portal.accessMode}; parserStatus=${portal.parserStatus}.`,
      occumedFit: portal.occumedFit,
      buyerSector: portal.buyerSector,
      occumedServiceCategories: portal.occumedServiceCategories,
      relevanceEvidenceCount: portal.relevanceEvidenceUrls.length,
      relevanceReasonCodes: portal.relevanceReasonCodes,
      lastRelevanceVerified: portal.lastRelevanceVerified,
    } satisfies PublicPortalSource;
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
    const normalizedExpectedDomain = expectedDomain?.replace(/^www\./, "").toLowerCase();
    const normalizedUrlDomain = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (normalizedExpectedDomain && normalizedUrlDomain !== normalizedExpectedDomain) {
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
  if (!AGENCY_TYPES.includes(source.agencyType))
    errors.push(`invalid agencyType: ${source.agencyType}`);
  if (!SOURCE_LEVELS.includes(source.sourceLevel))
    errors.push(`invalid sourceLevel: ${source.sourceLevel}`);
  if (!SCRAPER_TYPES.includes(source.scraperType))
    errors.push(`invalid scraperType: ${source.scraperType}`);
  if (!VERIFICATION_STATUSES.includes(source.verificationStatus))
    errors.push(`invalid verificationStatus: ${source.verificationStatus}`);
  if (/\s/.test(source.id)) errors.push("id must not contain whitespace");
  if (/^https?:\/\//i.test(source.domain)) errors.push("domain must be a hostname, not a URL");
  validatePublicPortalUrl("sourceUrl", source.sourceUrl, source.domain, errors);
  validatePublicPortalUrl("searchUrl", source.searchUrl, source.domain, errors);
  if (source.enabled && source.verificationStatus !== "verified") {
    errors.push("enabled sources must be verified");
  }
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
  const aggregatorDomainLeakage: string[] = [];
  const byOccumedFit: Record<string, number> = {};

  for (const source of sources) {
    ids.set(source.id, (ids.get(source.id) ?? 0) + 1);
    if (validatePublicPortalSource(source).some((error) => error.includes("Url") || error.includes("domain"))) {
      invalidUrls.push(source.id);
    }
    if (isAggregatorDomain(source.domain))
      aggregatorDomainLeakage.push(source.id);
    const fit = source.occumedFit ?? "unclassified";
    byOccumedFit[fit] = (byOccumedFit[fit] ?? 0) + 1;
  }

  return {
    totalDerivedSources: sources.length,
    enabledSources: sources.filter((source) => source.enabled).length,
    needsReviewSources: sources.filter(
      (source) => source.verificationStatus === "needs_review",
    ).length,
    disabledLoginOrDynamicSources: sources.filter(
      (source) =>
        !source.enabled &&
        (source.accessMode === "dynamic_html" ||
          source.accessMode === "portal"),
    ).length,
    duplicateIds: [...ids.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => id),
    invalidUrls,
    aggregatorDomainLeakage,
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
  const normalizedSearchUrl = String(row.searchUrl ?? "").trim() || undefined;
  const domain = sourceUrl ? normalizeDomain(sourceUrl) : normalizedSearchUrl ? normalizeDomain(normalizedSearchUrl) : "";
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
    scraperType: String(
      row.scraperType ?? "static_html",
    ) as PublicPortalScraperType,
    enabled: String(row.enabled ?? "false").toLowerCase() === "true",
    verificationStatus: String(
      row.verificationStatus ?? "needs_review",
    ) as PublicPortalVerificationStatus,
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
