import type { DirectRfpPortal } from "./directRfpPortals";
import { isRegisteredPublicPortalAdapter } from "./publicPortalAdapterRegistry";

export type CatalogueAuditSeverity = "critical" | "error" | "warning" | "info";

export type CatalogueAuditCode =
  | "DUPLICATE_ID"
  | "DUPLICATE_EFFECTIVE_ENDPOINT"
  | "DUPLICATE_JURISDICTION"
  | "INVALID_URL"
  | "DOMAIN_MISMATCH"
  | "INVALID_STATE_CODE"
  | "MISSING_US_STATE"
  | "AGGREGATOR_WITHOUT_ADAPTER"
  | "THIRD_PARTY_PLATFORM_ADAPTER"
  | "READY_STATUS_WITHOUT_RUNTIME_ADAPTER"
  | "REGISTERED_ADAPTER_STATUS_DRIFT"
  | "LANDING_PAGE_ONLY"
  | "SEARCH_URL_NOT_MORE_DIRECT"
  | "RELEVANCE_EVIDENCE_MISSING"
  | "RELEVANCE_DATE_INVALID"
  | "RELEVANCE_EVIDENCE_URL_INVALID"
  | "CENTRALIZED_SOURCE_DUPLICATED_AS_BUYERS";

export interface CatalogueAuditFinding {
  severity: CatalogueAuditSeverity;
  code: CatalogueAuditCode;
  portalIds: string[];
  message: string;
  field?: string;
  value?: string;
}

export interface CatalogueAuditSummary {
  total: number;
  bySeverity: Record<CatalogueAuditSeverity, number>;
  byCode: Partial<Record<CatalogueAuditCode, number>>;
  duplicateEndpointClusters: number;
  duplicateJurisdictionClusters: number;
  registeredAdapters: number;
  readyToParse: number;
  needsParser: number;
  catalogOnly: number;
}

export interface CatalogueAuditReport {
  generatedAt: string;
  summary: CatalogueAuditSummary;
  findings: CatalogueAuditFinding[];
}

const VALID_US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI",
  "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI",
  "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC",
  "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
  "VA", "VT", "WA", "WV", "WI", "WY", "DC", "PR", "VI", "GU", "AS",
  "MP",
]);

const THIRD_PARTY_PLATFORM_PATTERNS = [
  "bidnet",
  "demandstar",
  "govwin",
  "planetbids",
  "opengov",
  "periscope",
  "s2g",
  "bonfirehub",
  "sciquest",
  "ionwave",
  "publicpurchase",
];

const LANDING_PAGE_LANGUAGE =
  /entry point|vendor resources|supplier registration|vendor registration|doing business|procurement services site|purchasing page|links? to|directs? vendors|contact(?:s| information)? only|obtained from the purchasing office/i;

const OPPORTUNITY_LANGUAGE =
  /current (?:bids|solicitations|opportunities)|open (?:bids|solicitations|opportunities)|bid postings|rfps?|requests? for (?:bids|proposals|quotes)|contract opportunities|business opportunities/i;

function normalizedHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function parseUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return /^https?:$/.test(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

export function canonicalCatalogueUrl(value: string): string | null {
  const parsed = parseUrl(value);
  if (!parsed) return null;
  parsed.hash = "";
  parsed.hostname = normalizedHost(parsed.hostname);
  for (const parameter of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
  ]) {
    parsed.searchParams.delete(parameter);
  }
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  const query = [...parsed.searchParams.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  parsed.search = "";
  for (const [key, value] of query) parsed.searchParams.append(key, value);
  return parsed.toString().toLowerCase();
}

function effectiveEndpoint(portal: DirectRfpPortal): string {
  return portal.searchUrl || portal.url;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    grouped.set(value, [...(grouped.get(value) ?? []), item]);
  }
  return grouped;
}

function finding(
  severity: CatalogueAuditSeverity,
  code: CatalogueAuditCode,
  portalIds: string[],
  message: string,
  field?: string,
  value?: string,
): CatalogueAuditFinding {
  return { severity, code, portalIds: [...portalIds].sort(), message, field, value };
}

function hasThirdPartyPlatformHost(portal: DirectRfpPortal): boolean {
  const host = normalizedHost(portal.domain);
  return THIRD_PARTY_PLATFORM_PATTERNS.some((pattern) => host.includes(pattern));
}

function isLikelyLandingPage(portal: DirectRfpPortal): boolean {
  const endpoint = parseUrl(effectiveEndpoint(portal));
  if (!endpoint) return false;
  const rootLike = ["/", "/index.html", "/default.aspx", "/home"].includes(
    endpoint.pathname.toLowerCase().replace(/\/$/, "") || "/",
  );
  return (
    portal.parserStatus === "catalog_only" &&
    (LANDING_PAGE_LANGUAGE.test(portal.notes) ||
      (rootLike && !OPPORTUNITY_LANGUAGE.test(`${portal.name} ${portal.notes}`)))
  );
}

function auditPortal(portal: DirectRfpPortal): CatalogueAuditFinding[] {
  const findings: CatalogueAuditFinding[] = [];
  const sourceUrl = parseUrl(portal.url);
  const searchUrl = portal.searchUrl ? parseUrl(portal.searchUrl) : null;
  const effectiveUrl = searchUrl ?? sourceUrl;

  if (!sourceUrl) {
    findings.push(
      finding("critical", "INVALID_URL", [portal.id], "url is not a valid HTTP(S) URL", "url", portal.url),
    );
  }
  if (portal.searchUrl && !searchUrl) {
    findings.push(
      finding(
        "critical",
        "INVALID_URL",
        [portal.id],
        "searchUrl is not a valid HTTP(S) URL",
        "searchUrl",
        portal.searchUrl,
      ),
    );
  }
  if (effectiveUrl && normalizedHost(effectiveUrl.hostname) !== normalizedHost(portal.domain)) {
    findings.push(
      finding(
        "error",
        "DOMAIN_MISMATCH",
        [portal.id],
        "declared domain does not match the effective opportunity/search URL hostname",
        "domain",
        `${portal.domain} != ${effectiveUrl.hostname}`,
      ),
    );
  }

  if (portal.country === "US" && portal.level !== "federal") {
    if (!portal.state) {
      findings.push(
        finding("error", "MISSING_US_STATE", [portal.id], "US state/district source is missing a state or territory code", "state"),
      );
    } else if (!VALID_US_STATE_CODES.has(portal.state)) {
      findings.push(
        finding("error", "INVALID_STATE_CODE", [portal.id], "state or territory code is not recognized", "state", portal.state),
      );
    }
  }

  const registered = isRegisteredPublicPortalAdapter(portal.id) || portal.id === "us-sam-gov";
  if (hasThirdPartyPlatformHost(portal)) {
    findings.push(
      registered
        ? finding(
            "info",
            "THIRD_PARTY_PLATFORM_ADAPTER",
            [portal.id],
            "buyer-specific third-party platform is backed by a registered runtime adapter",
            "domain",
            portal.domain,
          )
        : finding(
            "error",
            "AGGREGATOR_WITHOUT_ADAPTER",
            [portal.id],
            "third-party marketplace/network domain has no registered buyer-specific adapter",
            "domain",
            portal.domain,
          ),
    );
  }

  if (portal.parserStatus === "ready_to_parse" && !registered) {
    findings.push(
      finding(
        "warning",
        "READY_STATUS_WITHOUT_RUNTIME_ADAPTER",
        [portal.id],
        "ready_to_parse is unsupported by a registered adapter or official API and must be verified or downgraded",
        "parserStatus",
        portal.parserStatus,
      ),
    );
  }
  if (registered && portal.parserStatus !== "ready_to_parse") {
    findings.push(
      finding(
        "error",
        "REGISTERED_ADAPTER_STATUS_DRIFT",
        [portal.id],
        "registered runtime adapter conflicts with catalogue parser status",
        "parserStatus",
        portal.parserStatus,
      ),
    );
  }

  if (isLikelyLandingPage(portal)) {
    findings.push(
      finding(
        "warning",
        "LANDING_PAGE_ONLY",
        [portal.id],
        "record appears to be a procurement landing/resource page rather than a direct current-opportunity listing",
        "searchUrl",
        effectiveEndpoint(portal),
      ),
    );
  }
  if (portal.searchUrl && canonicalCatalogueUrl(portal.searchUrl) === canonicalCatalogueUrl(portal.url)) {
    if (LANDING_PAGE_LANGUAGE.test(portal.notes) && !OPPORTUNITY_LANGUAGE.test(`${portal.name} ${portal.notes}`)) {
      findings.push(
        finding(
          "info",
          "SEARCH_URL_NOT_MORE_DIRECT",
          [portal.id],
          "searchUrl duplicates the general landing page and does not identify a more direct opportunity listing",
          "searchUrl",
          portal.searchUrl,
        ),
      );
    }
  }

  if (portal.occumedFit === "verified_high") {
    if (!portal.relevanceEvidence?.length || !portal.relevanceEvidenceUrls?.length) {
      findings.push(
        finding(
          "error",
          "RELEVANCE_EVIDENCE_MISSING",
          [portal.id],
          "verified_high relevance requires explicit evidence text and official evidence URLs",
          "occumedFit",
          portal.occumedFit,
        ),
      );
    }
  }
  if (portal.lastRelevanceVerified && Number.isNaN(Date.parse(portal.lastRelevanceVerified))) {
    findings.push(
      finding(
        "error",
        "RELEVANCE_DATE_INVALID",
        [portal.id],
        "lastRelevanceVerified is not a valid date",
        "lastRelevanceVerified",
        portal.lastRelevanceVerified,
      ),
    );
  }
  for (const evidenceUrl of portal.relevanceEvidenceUrls ?? []) {
    if (!parseUrl(evidenceUrl)) {
      findings.push(
        finding(
          "error",
          "RELEVANCE_EVIDENCE_URL_INVALID",
          [portal.id],
          "relevance evidence URL is invalid",
          "relevanceEvidenceUrls",
          evidenceUrl,
        ),
      );
    }
  }

  return findings;
}

export function auditDirectRfpCatalogue(
  portals: readonly DirectRfpPortal[],
  generatedAt = new Date().toISOString(),
): CatalogueAuditReport {
  const findings = portals.flatMap(auditPortal);

  for (const [id, group] of groupBy(portals, (portal) => portal.id)) {
    if (group.length > 1) {
      findings.push(
        finding("critical", "DUPLICATE_ID", group.map((portal) => portal.id), `portal id appears ${group.length} times`, "id", id),
      );
    }
  }

  let duplicateEndpointClusters = 0;
  for (const [endpoint, group] of groupBy(portals, (portal) => canonicalCatalogueUrl(effectiveEndpoint(portal)) ?? `invalid:${portal.id}`)) {
    if (group.length <= 1 || endpoint.startsWith("invalid:")) continue;
    duplicateEndpointClusters += 1;
    const jurisdictions = new Set(group.map((portal) => `${portal.country}:${portal.state ?? ""}:${portal.jurisdiction.toLowerCase()}`));
    findings.push(
      finding(
        jurisdictions.size > 1 ? "error" : "warning",
        jurisdictions.size > 1 ? "CENTRALIZED_SOURCE_DUPLICATED_AS_BUYERS" : "DUPLICATE_EFFECTIVE_ENDPOINT",
        group.map((portal) => portal.id),
        jurisdictions.size > 1
          ? "one centralized endpoint is duplicated as multiple distinct buyer sources; retain a canonical source and represent coverage separately"
          : "multiple catalogue rows resolve to the same effective endpoint",
        "searchUrl",
        endpoint,
      ),
    );
  }

  let duplicateJurisdictionClusters = 0;
  for (const [jurisdiction, group] of groupBy(
    portals,
    (portal) => `${portal.country}:${portal.state ?? ""}:${portal.level}:${portal.jurisdiction.trim().toLowerCase()}`,
  )) {
    if (group.length <= 1) continue;
    duplicateJurisdictionClusters += 1;
    findings.push(
      finding(
        "warning",
        "DUPLICATE_JURISDICTION",
        group.map((portal) => portal.id),
        "multiple catalogue rows claim the same jurisdiction and level; verify that they are genuinely distinct official sources",
        "jurisdiction",
        jurisdiction,
      ),
    );
  }

  const bySeverity: Record<CatalogueAuditSeverity, number> = {
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
  };
  const byCode: Partial<Record<CatalogueAuditCode, number>> = {};
  for (const item of findings) {
    bySeverity[item.severity] += 1;
    byCode[item.code] = (byCode[item.code] ?? 0) + 1;
  }

  findings.sort(
    (left, right) =>
      ["critical", "error", "warning", "info"].indexOf(left.severity) -
        ["critical", "error", "warning", "info"].indexOf(right.severity) ||
      left.code.localeCompare(right.code) ||
      left.portalIds.join(",").localeCompare(right.portalIds.join(",")),
  );

  return {
    generatedAt,
    summary: {
      total: portals.length,
      bySeverity,
      byCode,
      duplicateEndpointClusters,
      duplicateJurisdictionClusters,
      registeredAdapters: portals.filter(
        (portal) => isRegisteredPublicPortalAdapter(portal.id) || portal.id === "us-sam-gov",
      ).length,
      readyToParse: portals.filter((portal) => portal.parserStatus === "ready_to_parse").length,
      needsParser: portals.filter((portal) => portal.parserStatus === "needs_parser").length,
      catalogOnly: portals.filter((portal) => portal.parserStatus === "catalog_only").length,
    },
    findings,
  };
}

export function catalogueAuditMarkdown(report: CatalogueAuditReport): string {
  const lines = [
    "# Direct RFP Catalogue Quality and Accuracy Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Catalogue records: ${report.summary.total}`,
    `- Critical findings: ${report.summary.bySeverity.critical}`,
    `- Error findings: ${report.summary.bySeverity.error}`,
    `- Warning findings: ${report.summary.bySeverity.warning}`,
    `- Informational findings: ${report.summary.bySeverity.info}`,
    `- Registered adapters / official APIs: ${report.summary.registeredAdapters}`,
    `- Duplicate endpoint clusters: ${report.summary.duplicateEndpointClusters}`,
    `- Duplicate jurisdiction clusters: ${report.summary.duplicateJurisdictionClusters}`,
    "",
    "## Findings",
    "",
  ];

  if (report.findings.length === 0) {
    lines.push("No findings.");
    return `${lines.join("\n")}\n`;
  }

  for (const item of report.findings) {
    lines.push(
      `### ${item.severity.toUpperCase()} · ${item.code} · ${item.portalIds.join(", ")}`,
      "",
      item.message,
      ...(item.field ? ["", `- Field: \`${item.field}\``] : []),
      ...(item.value ? [`- Value: \`${item.value}\``] : []),
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
