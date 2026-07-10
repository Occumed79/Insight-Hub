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

export const PUBLIC_PORTAL_SOURCES: PublicPortalSource[] = [
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
