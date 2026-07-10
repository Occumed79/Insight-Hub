import { DIRECT_RFP_PORTALS, type DirectRfpPortal, type DirectRfpPortalAccessMode } from "../directRfpPortals";

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
  searchUrl?: string;
  domain: string;
  portalPlatform?: string;
  sourceLevel: PublicPortalSourceLevel;
  level?: DirectRfpPortal["level"];
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
}

const EXPLICIT_PUBLIC_PORTAL_SOURCES: PublicPortalSource[] = [
  {
    id: "texasEsbd",
    agencyName: "Texas ESBD / Texas SmartBuy",
    agencyType: "state",
    state: "TX",
    sourceUrl: "https://www.txsmartbuy.gov/esbd",
    searchUrl: "https://www.txsmartbuy.gov/esbd",
    domain: "txsmartbuy.gov",
    portalPlatform: "Texas SmartBuy",
    sourceLevel: "state",
    level: "state",
    accessMode: "csv",
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
    searchUrl: "https://www.nyscr.ny.gov/Ads/Search",
    domain: "nyscr.ny.gov",
    portalPlatform: "New York State Contract Reporter",
    sourceLevel: "state",
    level: "state",
    accessMode: "public_html",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: "Existing working direct parser for the official NYSCR public search page.",
  },
];

const EXPLICIT_DIRECT_PORTAL_IDS = new Set(["tx-esbd", "ny-contract-reporter"]);
const AGGREGATOR_DOMAIN_PATTERNS = ["bidnet", "demandstar", "govwin", "planetbids", "opengov", "periscope", "s2g"];

function isAggregatorDomain(domain: string): boolean {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  return AGGREGATOR_DOMAIN_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isSafeDirectPortal(portal: DirectRfpPortal): boolean {
  return portal.country === "US" && portal.level !== "federal" && !portal.requiresLogin && !portal.requiresKey && !isAggregatorDomain(portal.domain);
}

function sourceLevelFromPortal(portal: DirectRfpPortal): PublicPortalSourceLevel {
  if (portal.level === "district") return "district";
  return "state";
}

function scraperTypeFromAccessMode(accessMode: DirectRfpPortalAccessMode): PublicPortalScraperType {
  if (accessMode === "public_html") return "static_html";
  if (accessMode === "csv") return "static_html";
  if (accessMode === "api") return "public_json";
  return "playwright_public";
}


export function derivePublicPortalSourcesFromDirectCatalog(portals: DirectRfpPortal[] = DIRECT_RFP_PORTALS): PublicPortalSource[] {
  return portals
    .filter((portal) => !EXPLICIT_DIRECT_PORTAL_IDS.has(portal.id))
    .filter(isSafeDirectPortal)
    .map((portal) => {
      const sourceUrl = portal.searchUrl || portal.url;
      const enabled = false;
      return {
        id: portal.id,
        agencyName: portal.name,
        agencyType: portal.level === "district" ? "special_district" : "state",
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
      } satisfies PublicPortalSource;
    });
}

const DERIVED_PUBLIC_PORTAL_SOURCES = derivePublicPortalSourcesFromDirectCatalog();

export const PUBLIC_PORTAL_SOURCES: PublicPortalSource[] = [
  ...EXPLICIT_PUBLIC_PORTAL_SOURCES,
  ...DERIVED_PUBLIC_PORTAL_SOURCES,
];

function normalizeDomain(sourceUrl: string): string {
  return new URL(sourceUrl).hostname.replace(/^www\./, "").toLowerCase();
}

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
}

export function validatePublicPortalCatalog(sources: PublicPortalSource[] = PUBLIC_PORTAL_SOURCES): PublicPortalCatalogValidationSummary {
  const ids = new Map<string, number>();
  const invalidUrls: string[] = [];
  const aggregatorDomainLeakage: string[] = [];

  for (const source of sources) {
    ids.set(source.id, (ids.get(source.id) ?? 0) + 1);
    try {
      const parsed = new URL(source.sourceUrl);
      if (!/^https?:$/.test(parsed.protocol)) invalidUrls.push(source.id);
    } catch {
      invalidUrls.push(source.id);
    }
    if (isAggregatorDomain(source.domain)) aggregatorDomainLeakage.push(source.id);
  }

  return {
    totalDerivedSources: sources.filter((source) => !EXPLICIT_PUBLIC_PORTAL_SOURCES.some((explicit) => explicit.id === source.id)).length,
    enabledSources: sources.filter((source) => source.enabled).length,
    needsReviewSources: sources.filter((source) => source.verificationStatus === "needs_review").length,
    disabledLoginOrDynamicSources: sources.filter((source) => !source.enabled && (source.accessMode === "dynamic_html" || source.accessMode === "portal")).length,
    duplicateIds: [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id),
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
    searchUrl: String(row.searchUrl ?? "").trim() || undefined,
    domain,
    portalPlatform: String(row.portalPlatform ?? "").trim() || undefined,
    sourceLevel: (row.sourceLevel as PublicPortalSourceLevel) ?? "municipal",
    scraperType: String(row.scraperType ?? "static_html") as PublicPortalScraperType,
    enabled: String(row.enabled ?? "false").toLowerCase() === "true",
    verificationStatus: String(row.verificationStatus ?? "needs_review") as PublicPortalVerificationStatus,
    notes: String(row.notes ?? "").trim() || undefined,
  };
}
