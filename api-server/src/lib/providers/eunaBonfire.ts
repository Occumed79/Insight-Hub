import { createHash } from "crypto";

import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { serperProvider, type SerperSearchResult } from "./serper";
import { extractMetadataFromText } from "../search/heuristicExtract";
import { classifyResult } from "../search/relevance";

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_RESULT_LIMIT = 50;
const UNKNOWN_POSTED_DATE = new Date(0);
const EUNA_DOMAIN_EXPRESSION = "(site:bonfirehub.com OR site:bonfirehub.ca)";
const PROCUREMENT_EXPRESSION = "(RFP OR RFQ OR bid OR solicitation OR tender OR procurement)";

const DEFAULT_SERVICE_QUERIES = [
  '("occupational health services" OR "occupational medicine services" OR "employee health services")',
  '("pre-employment physical" OR "medical examination services" OR "fitness for duty")',
  '("drug and alcohol testing" OR "drug testing services" OR "medical review officer")',
  '("medical surveillance" OR "respirator fit testing" OR "audiometric testing")',
  '("firefighter physical" OR "public safety physical" OR "NFPA 1582")',
  '("deployment medical" OR "post deployment health assessment" OR "employee health screening")',
];

const BLOCKED_VENDOR_PATHS = [
  "/dashboard",
  "/settings",
  "/agencies",
  "/login",
  "/signup",
  "/register",
  "/account",
];

function normalizedHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isEunaHost(hostname: string): boolean {
  const host = normalizedHost(hostname);
  return host === "bonfirehub.com" ||
    host.endsWith(".bonfirehub.com") ||
    host === "bonfirehub.ca" ||
    host.endsWith(".bonfirehub.ca");
}

function isBlockedPrivatePath(url: URL): boolean {
  if (normalizedHost(url.hostname) !== "vendor.bonfirehub.com") return false;
  return BLOCKED_VENDOR_PATHS.some((path) => url.pathname.toLowerCase().startsWith(path));
}

function isLikelyOpportunityPath(url: URL): boolean {
  const pathAndQuery = `${url.pathname}${url.search}`.toLowerCase();
  return [
    "/opportunit",
    "/portal",
    "/project",
    "openopportunities",
    "publicnotice",
    "solicitation",
  ].some((token) => pathAndQuery.includes(token));
}

function isUsefulResult(result: SerperSearchResult): boolean {
  if (!result.link) return false;

  let parsed: URL;
  try {
    parsed = new URL(result.link);
  } catch {
    return false;
  }

  if (!isEunaHost(parsed.hostname) || isBlockedPrivatePath(parsed)) return false;

  const raw = `${result.title} ${result.snippet} ${result.link}`;
  const classification = classifyResult({
    title: result.title,
    snippet: result.snippet,
    url: result.link,
    allowHistorical: false,
  });

  if (classification.rejected) return false;
  return isLikelyOpportunityPath(parsed) || /\b(rfp|rfq|bid|solicitation|tender|procurement)\b/i.test(raw);
}

function titleCase(value: string): string {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function agencyFromResult(result: SerperSearchResult, agencyHint?: string): string {
  if (agencyHint?.trim()) return agencyHint.trim();

  const titleParts = result.title
    .split(/\s+[|–—-]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const nonGenericTitlePart = [...titleParts].reverse().find((part) =>
    !/^(bonfire|euna supplier network|project details|opportunity details)$/i.test(part),
  );
  if (nonGenericTitlePart && nonGenericTitlePart.length >= 3 && nonGenericTitlePart.length <= 120) {
    return nonGenericTitlePart;
  }

  try {
    const host = normalizedHost(new URL(result.link).hostname);
    const subdomain = host
      .replace(/\.bonfirehub\.(com|ca)$/i, "")
      .replace(/^vendor$/, "");
    if (subdomain) return titleCase(subdomain);
  } catch {
    // Fall through to the platform-level label.
  }

  return "Euna Supplier Network Agency";
}

function parsedSearchDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizedResultKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${normalizedHost(parsed.hostname)}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function resultToOpportunity(result: SerperSearchResult): NormalizedOpportunity | null {
  if (!isUsefulResult(result)) return null;

  const metadata = extractMetadataFromText(result.snippet, result.title);
  if (metadata.deadline && metadata.deadline < new Date()) return null;

  const searchDate = parsedSearchDate(result.date);
  const urlHash = createHash("sha256").update(result.link).digest("hex").slice(0, 20);

  return {
    externalId: `euna-${urlHash}`,
    title: result.title.trim() || "Euna Supplier Network Opportunity",
    agency: agencyFromResult(result, metadata.agencyHint),
    type: "Solicitation",
    status: "active",
    postedDate: searchDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline: metadata.deadline,
    estimatedValue: metadata.estimatedValue,
    description: result.snippet,
    sourceUrl: result.link,
    source: "eunaBonfire",
    providerName: "eunaBonfire",
    rawData: {
      providerName: "eunaBonfire",
      providerFamily: "euna_supplier_network",
      providerType: "serper_public_euna_discovery",
      platform: "Euna Supplier Network / Bonfire",
      discoveryMethod: "serper_public_euna",
      sourceConfidence: "low",
      searchResultDate: result.date,
      dateUnknown: !searchDate,
      tags: [
        "euna-supplier-network",
        "bonfire",
        "serper-discovery",
        "verification-required",
        ...(!searchDate ? ["date-unknown"] : []),
      ],
      notes: "Search-discovered from a public Euna Supplier Network / Bonfire page through Serper. This is not a direct Euna feed and the source page must be verified.",
    },
  };
}

export function buildEunaBonfireSearchQueries(keywords?: string): string[] {
  const custom = keywords?.trim()
    ? [`${EUNA_DOMAIN_EXPRESSION} (${keywords.trim()}) ${PROCUREMENT_EXPRESSION} -awarded -\"award notice\"`]
    : [];

  const defaults = DEFAULT_SERVICE_QUERIES.map(
    (serviceQuery) =>
      `${EUNA_DOMAIN_EXPRESSION} ${serviceQuery} ${PROCUREMENT_EXPRESSION} (${CURRENT_YEAR} OR ${CURRENT_YEAR + 1}) -awarded -\"award notice\"`,
  );

  return [...custom, ...defaults];
}

export class EunaBonfireProvider implements DataSourceProvider {
  readonly name = "eunaBonfire" as const;

  async isConfigured(): Promise<boolean> {
    return serperProvider.isConfigured();
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    if (!(await this.isConfigured())) {
      return {
        records: [],
        total: 0,
        errors: ["Serper API key not configured; Euna Supplier Network discovery is disabled."],
      };
    }

    const results = await serperProvider.searchMultiple(
      buildEunaBonfireSearchQueries(options.keywords),
      10,
    );
    const seen = new Set<string>();
    const records: NormalizedOpportunity[] = [];
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_RESULT_LIMIT, 1), DEFAULT_RESULT_LIMIT);

    for (const result of results) {
      const key = normalizedResultKey(result.link);
      if (seen.has(key)) continue;
      seen.add(key);

      const opportunity = resultToOpportunity(result);
      if (!opportunity) continue;
      records.push(opportunity);
      if (records.length >= limit) break;
    }

    return { records, total: records.length, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return {
      name: this.name,
      configured,
      healthy: configured,
      errorMessage: configured
        ? undefined
        : "Uses the existing Serper key to discover public Euna/Bonfire opportunity pages.",
    };
  }
}

export const eunaBonfireProvider = new EunaBonfireProvider();
