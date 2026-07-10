import { DIRECT_RFP_PORTALS, type DirectRfpPortal } from "../directRfpPortals";

export const AGENCY_TYPES = ["state", "county", "city", "fire_department", "fire_district", "ems", "public_safety", "school_district", "special_district", "public_authority", "transit_authority", "airport_authority", "port_authority"] as const;
export const SOURCE_LEVELS = ["state", "county", "municipal", "district", "authority"] as const;
export const SCRAPER_TYPES = ["static_html", "scrapy", "playwright_public", "rss", "public_json", "pdf_links", "existing_parser"] as const;
export const VERIFICATION_STATUSES = ["verified", "needs_review", "broken"] as const;

export type PublicPortalAgencyType = typeof AGENCY_TYPES[number];
export type PublicPortalSourceLevel = typeof SOURCE_LEVELS[number];
export type PublicPortalScraperType = typeof SCRAPER_TYPES[number];
export type PublicPortalVerificationStatus = typeof VERIFICATION_STATUSES[number];

export interface PublicPortalSource {
  id: string;
  agencyName: string;
  agencyType: PublicPortalAgencyType;
  state: string;
  county?: string;
  city?: string;
  sourceUrl: string;
  domain: string;
  portalPlatform?: string;
  sourceLevel: PublicPortalSourceLevel;
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
}

export interface PublicPortalCatalogValidationSummary {
  totalDerivedSources: number;
  enabledSources: number;
  needsReviewSources: number;
  disabledLoginOrDynamicSources: number;
  duplicateIds: string[];
  invalidUrls: string[];
  aggregatorDomainLeakage: string[];
}

const EXPLICIT_PUBLIC_PORTAL_SOURCES: PublicPortalSource[] = [
  {
    id: "texasEsbd",
    agencyName: "Texas ESBD / Texas SmartBuy",
    agencyType: "state",
    state: "TX",
    sourceUrl: "https://www.txsmartbuy.gov/esbd",
    domain: "txsmartbuy.gov",
    portalPlatform: "Texas SmartBuy",
    sourceLevel: "state",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: "Existing working direct parser for the official Texas ESBD / Texas SmartBuy public solicitations.",
  },
  {
    id: "nyScr",
    agencyName: "New York State Contract Reporter",
    agencyType: "state",
    state: "NY",
    sourceUrl: "https://www.nyscr.ny.gov/Ads/Search",
    domain: "nyscr.ny.gov",
    portalPlatform: "New York State Contract Reporter",
    sourceLevel: "state",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: "Existing working direct parser for the official NYSCR public search page.",
  },
];

const EXPLICIT_DIRECT_PORTAL_IDS = new Set(["tx-esbd", "ny-contract-reporter"]);
const SAFE_PUBLIC_HTML_DIRECT_PORTAL_IDS = new Set(["va-eva", "pa-emarketplace", "oh-ohiobuys", "md-emma", "nc-evp"]);
const AGGREGATOR_DOMAIN_PATTERNS = ["bidnet", "demandstar", "govwin", "planetbids", "opengov", "periscope", "s2g"];

function normalizeDomain(sourceUrl: string): string {
  return new URL(sourceUrl).hostname.replace(/^www\./, "").toLowerCase();
}

function isAggregatorDomain(domain: string): boolean {
  const normalized = domain.replace(/^www\./, "").toLowerCase();
  return AGGREGATOR_DOMAIN_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function sourceUrlForPortal(portal: DirectRfpPortal): string {
  return portal.searchUrl || portal.url;
}

function sourceLevelForPortal(portal: DirectRfpPortal): PublicPortalSourceLevel {
  if (portal.level === "state") return "state";
  if (portal.level === "district") return "district";
  return "authority";
}

function scraperTypeForPortal(portal: DirectRfpPortal): PublicPortalScraperType {
  if (portal.id === "tx-esbd" || portal.id === "ny-contract-reporter") return "existing_parser";
  return "static_html";
}

function isSafeToFetchPublicly(portal: DirectRfpPortal): boolean {
  if (portal.requiresLogin) return false;
  if (!sourceUrlForPortal(portal)) return false;
  if (isAggregatorDomain(portal.domain)) return false;
  if (portal.accessMode === "public_html") return SAFE_PUBLIC_HTML_DIRECT_PORTAL_IDS.has(portal.id);
  return false;
}

function deriveSourceFromDirectPortal(portal: DirectRfpPortal): PublicPortalSource | null {
  if (portal.country !== "US") return null;
  if (portal.level === "federal") return null;
  if (EXPLICIT_DIRECT_PORTAL_IDS.has(portal.id)) return null;
  if (portal.requiresLogin) return null;

  const sourceUrl = sourceUrlForPortal(portal);
  if (!sourceUrl) return null;

  const domain = normalizeDomain(sourceUrl);
  if (isAggregatorDomain(domain)) return null;

  const enabled = isSafeToFetchPublicly(portal);
  const disabledReason = portal.accessMode === "dynamic_html" || portal.accessMode === "portal"
    ? " Disabled until a source-specific adapter confirms safe public fetch behavior."
    : "";

  return {
    id: portal.id,
    agencyName: portal.name,
    agencyType: "state",
    state: portal.state ?? "",
    sourceUrl,
    domain,
    portalPlatform: portal.name,
    sourceLevel: sourceLevelForPortal(portal),
    scraperType: scraperTypeForPortal(portal),
    enabled,
    verificationStatus: enabled ? "verified" : "needs_review",
    notes: `Derived from the official direct RFP portal catalog. Access mode: ${portal.accessMode}.${disabledReason} ${portal.notes}`.trim(),
  };
}

export function derivePublicPortalSourcesFromDirectCatalog(portals: DirectRfpPortal[] = DIRECT_RFP_PORTALS): PublicPortalSource[] {
  return portals.map(deriveSourceFromDirectPortal).filter((source): source is PublicPortalSource => Boolean(source));
}

export const PUBLIC_PORTAL_SOURCES: PublicPortalSource[] = [
  ...EXPLICIT_PUBLIC_PORTAL_SOURCES,
  ...derivePublicPortalSourcesFromDirectCatalog(),
];

export function validatePublicPortalSource(source: PublicPortalSource): string[] {
  const errors: string[] = [];
  if (!source.id.trim()) errors.push("id is required");
  if (!source.agencyName.trim()) errors.push("agencyName is required");
  if (!AGENCY_TYPES.includes(source.agencyType)) errors.push(`invalid agencyType: ${source.agencyType}`);
  if (!SOURCE_LEVELS.includes(source.sourceLevel)) errors.push(`invalid sourceLevel: ${source.sourceLevel}`);
  if (!SCRAPER_TYPES.includes(source.scraperType)) errors.push(`invalid scraperType: ${source.scraperType}`);
  if (!VERIFICATION_STATUSES.includes(source.verificationStatus)) errors.push(`invalid verificationStatus: ${source.verificationStatus}`);
  try {
    const parsed = new URL(source.sourceUrl);
    if (!/^https?:$/.test(parsed.protocol)) errors.push("sourceUrl must be http(s)");
    if (source.domain && normalizeDomain(source.sourceUrl) !== source.domain.replace(/^www\./, "").toLowerCase()) {
      errors.push("domain must match sourceUrl hostname");
    }
  } catch {
    errors.push("sourceUrl must be a valid URL");
  }
  if (source.enabled && source.verificationStatus !== "verified") {
    errors.push("enabled sources must be verified");
  }
  if (isAggregatorDomain(source.domain)) {
    errors.push("aggregator domain is not allowed");
  }
  return errors;
}

export function validatePublicPortalCatalog(sources: PublicPortalSource[] = PUBLIC_PORTAL_SOURCES): PublicPortalCatalogValidationSummary {
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const invalidUrls: string[] = [];
  const aggregatorDomainLeakage: string[] = [];
  let disabledLoginOrDynamicSources = 0;

  for (const source of sources) {
    if (seenIds.has(source.id)) duplicateIds.add(source.id);
    seenIds.add(source.id);

    if (validatePublicPortalSource(source).some((error) => error.includes("sourceUrl") || error.includes("domain must match"))) {
      invalidUrls.push(source.id);
    }
    if (isAggregatorDomain(source.domain)) aggregatorDomainLeakage.push(`${source.id}:${source.domain}`);
    if (!source.enabled && /dynamic_html|portal|requires login|login/i.test(source.notes ?? "")) disabledLoginOrDynamicSources++;
  }

  return {
    totalDerivedSources: sources.length,
    enabledSources: sources.filter((source) => source.enabled).length,
    needsReviewSources: sources.filter((source) => source.verificationStatus === "needs_review").length,
    disabledLoginOrDynamicSources,
    duplicateIds: Array.from(duplicateIds),
    invalidUrls,
    aggregatorDomainLeakage,
  };
}

export function publicPortalSourceFromImport(row: Record<string, unknown>): PublicPortalSource {
  const sourceUrl = String(row.sourceUrl ?? "").trim();
  const agencyName = String(row.agencyName ?? "").trim();
  const id = String(row.id ?? `${String(row.state ?? "").toLowerCase()}-${agencyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`).trim();
  const domain = sourceUrl ? normalizeDomain(sourceUrl) : "";
  return {
    id,
    agencyName,
    agencyType: String(row.agencyType ?? "city") as PublicPortalAgencyType,
    state: String(row.state ?? "").trim().toUpperCase(),
    county: String(row.county ?? "").trim() || undefined,
    city: String(row.city ?? "").trim() || undefined,
    sourceUrl,
    domain,
    portalPlatform: String(row.portalPlatform ?? "").trim() || undefined,
    sourceLevel: (row.sourceLevel as PublicPortalSourceLevel) ?? "municipal",
    scraperType: String(row.scraperType ?? "static_html") as PublicPortalScraperType,
    enabled: String(row.enabled ?? "false").toLowerCase() === "true",
    verificationStatus: String(row.verificationStatus ?? "needs_review") as PublicPortalVerificationStatus,
    notes: String(row.notes ?? "").trim() || undefined,
  };
}
