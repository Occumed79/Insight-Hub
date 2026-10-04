import { createHash } from "crypto";

import type { IntelSignalType, IntelSource } from "@workspace/db/schema";
import {
  DIRECT_RFP_PORTALS,
  type DirectRfpPortal,
} from "../providers/directRfpPortals";
import {
  serperProvider,
  type SerperSearchResult,
} from "../providers/serper";
import { getRelevanceProfile } from "../search/relevanceProfile";
import { assessIntelText } from "./profileIntelRelevance";
import {
  profileLeadQueries,
  profilePolicyTerms,
  profileProcurementTerms,
  quotedOr,
  termRegex,
} from "../providers/profileQueryTerms";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RESULTS = 100;
const CURRENT_YEAR = new Date().getFullYear();

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

// Search expressions are assembled per call from the Neon-backed relevance profile: service phrases from its
// search-bundle lead queries, procurement wording from the bundles' procurement terms, and policy wording from
// the profile's policy bundle. Nothing here defines Occu-Med vocabulary.
const MAX_SERVICE_PHRASES = 8;
const MAX_PROCUREMENT_TERMS = 6;
const MAX_POLICY_TERMS = 8;

interface SearchExpressions {
  service: string;
  procurement: string;
  policy: string;
  /** Wording that makes a non-portal result a procurement or policy signal (profile procurement signals + policy terms). */
  signalPattern: RegExp | null;
}

function searchExpressions(): SearchExpressions {
  const profile = getRelevanceProfile();
  const paren = (expression: string) => (expression ? `(${expression})` : "");
  return {
    service: paren(quotedOr(profileLeadQueries(MAX_SERVICE_PHRASES, profile))),
    procurement: paren(profileProcurementTerms(MAX_PROCUREMENT_TERMS, profile).join(" OR ")),
    policy: paren(profilePolicyTerms(MAX_POLICY_TERMS, profile).map((term) => (/\s/.test(term) ? `"${term}"` : term)).join(" OR ")),
    signalPattern: termRegex([...profile.procurementSignals, ...profilePolicyTerms(Infinity, profile)]),
  };
}

// Notice lifecycle (already awarded / closed / cancelled) is expiration handling, not relevance.
const REJECT_PATTERN =
  /\b(award notice|intent to award|contract awarded|bid tabulation|closed solicitation|cancelled solicitation)\b/i;

interface DiscoveredStateResult extends SerperSearchResult {
  discoveryQuery: string;
  discoveryMode: "portal" | "government" | "news";
}

export interface StateIntelligenceRecord {
  externalId: string;
  stateCode: string;
  signalType: IntelSignalType;
  source: Extract<IntelSource, "state_portal" | "state_serper">;
  agency: string;
  title: string;
  summary: string | null;
  sourceUrl: string;
  publishedDate: Date | null;
  relevanceScore: number;
  rawData: Record<string, unknown>;
}

export interface StateIntelligenceFetchResult {
  records: StateIntelligenceRecord[];
  errors: string[];
  sources: Array<"state_portal" | "state_serper">;
}

function normalizedHost(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

function normalizedUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${normalizedHost(url.hostname)}${url.pathname.replace(/\/$/, "")}${url.search}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function portalsForState(stateCode: string): DirectRfpPortal[] {
  return DIRECT_RFP_PORTALS.filter(
    (portal) =>
      portal.country === "US" &&
      portal.state === stateCode &&
      portal.level === "state",
  );
}

function portalForUrl(
  value: string,
  portals: DirectRfpPortal[],
): DirectRfpPortal | undefined {
  try {
    const host = normalizedHost(new URL(value).hostname);
    return portals.find((portal) => {
      const domain = normalizedHost(portal.domain);
      return (
        host === domain ||
        host.endsWith(`.${domain}`) ||
        domain.endsWith(`.${host}`)
      );
    });
  } catch {
    return undefined;
  }
}

function isOfficialGovernmentResult(
  result: SerperSearchResult,
  stateName: string,
  portal: DirectRfpPortal | undefined,
): boolean {
  if (portal) return true;
  try {
    const host = normalizedHost(new URL(result.link).hostname);
    const text = `${result.title} ${result.snippet}`;
    return host.endsWith(".gov") && text.toLowerCase().includes(stateName.toLowerCase());
  } catch {
    return false;
  }
}

function parsePublishedDate(value: string | undefined, now: Date): Date | null {
  if (!value?.trim()) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const relative = value
    .trim()
    .toLowerCase()
    .match(/^(\d+)\s+(hour|day|week|month|year)s?\s+ago$/);
  if (!relative) return null;

  const amount = Number(relative[1]);
  const unit = relative[2];
  const multiplier =
    unit === "hour"
      ? 60 * 60 * 1000
      : unit === "day"
        ? DAY_MS
        : unit === "week"
          ? 7 * DAY_MS
          : unit === "month"
            ? 30 * DAY_MS
            : 365 * DAY_MS;
  return new Date(now.getTime() - amount * multiplier);
}

function hasStaleYearOnly(text: string): boolean {
  const years = Array.from(text.matchAll(/\b20\d{2}\b/g)).map((match) =>
    Number(match[0]),
  );
  if (years.length === 0) return false;
  const hasCurrentOrFuture = years.some(
    (year) => year >= CURRENT_YEAR && year <= CURRENT_YEAR + 2,
  );
  return years.some((year) => year < CURRENT_YEAR) && !hasCurrentOrFuture;
}

function classifySignal(
  text: string,
  portal: DirectRfpPortal | undefined,
): IntelSignalType {
  if (/\b(proposed rule|notice of proposed rulemaking|public hearing|rulemaking)\b/i.test(text)) {
    return "new_rulemaking";
  }
  if (/\b(enforcement|citation|penalty|fine|compliance action)\b/i.test(text)) {
    return "enforcement_action";
  }
  if (/\b(grant|funding opportunity|funding available|grant program)\b/i.test(text)) {
    return "grant_program";
  }
  if (/\b(budget|appropriation|funding plan|anticipated funding)\b/i.test(text)) {
    return "budget_funding";
  }
  if (/\b(procurement forecast|acquisition forecast|planned solicitation)\b/i.test(text)) {
    return "procurement_forecast";
  }
  if (
    portal ||
    /\b(rfp|rfq|invitation for bid|solicitation|bid opportunity|procurement)\b/i.test(text)
  ) {
    return "state_procurement";
  }
  if (/\b(regulation|administrative code|guidance|requirement|state law)\b/i.test(text)) {
    return "regulatory_change";
  }
  return "industry_trend";
}

function buildQueries(
  stateCode: string,
  stateName: string,
  portals: DirectRfpPortal[],
  keywords?: string,
): Array<{ query: string; mode: DiscoveredStateResult["discoveryMode"]; type?: "news" }> {
  const keywordExpression = keywords?.trim() ? ` (${keywords.trim()})` : "";
  const { service, procurement, policy } = searchExpressions();
  const queries: Array<{
    query: string;
    mode: DiscoveredStateResult["discoveryMode"];
    type?: "news";
  }> = [];

  const portalDomains = Array.from(new Set(portals.map((portal) => portal.domain))).slice(0, 8);
  if (portalDomains.length > 0) {
    const domains = portalDomains.map((domain) => `site:${domain}`).join(" OR ");
    queries.push({
      query: `(${domains}) ${service} ${procurement}${keywordExpression} -awarded -closed`,
      mode: "portal",
    });
  }

  queries.push({
    query: `"${stateName}" ${service} ${policy}${keywordExpression} site:.gov`,
    mode: "government",
  });
  queries.push({
    query: `"${stateName}" ${service} ${[procurement, policy].filter(Boolean).join(" OR ")}${keywordExpression}`,
    mode: "news",
    type: "news",
  });

  if (stateCode === "DC") {
    queries.push({
      query: `"District of Columbia" ${service} ${procurement}${keywordExpression} site:dc.gov`,
      mode: "government",
    });
  }

  return queries;
}

function resultToRecord(
  result: DiscoveredStateResult,
  stateCode: string,
  stateName: string,
  portals: DirectRfpPortal[],
  dateRange: number,
  now: Date,
): StateIntelligenceRecord | null {
  if (!result.title.trim() || !result.link.trim()) return null;

  const portal = portalForUrl(result.link, portals);
  if (!isOfficialGovernmentResult(result, stateName, portal)) return null;

  const text = `${result.title} ${result.snippet} ${result.link}`;
  if (REJECT_PATTERN.test(text) || hasStaleYearOnly(text)) return null;
  // Occu-Med relevance is the profile's: the text must name a profile service term (classifier evidence).
  const assessment = assessIntelText({ title: result.title, text: result.snippet, url: result.link, date: result.date });
  if (!assessment.topical) return null;
  if (!portal) {
    const { signalPattern } = searchExpressions();
    if (signalPattern && !signalPattern.test(text)) return null;
  }

  const publishedDate = parsePublishedDate(result.date, now);
  const cutoff = new Date(now.getTime() - dateRange * DAY_MS);
  if (publishedDate && publishedDate < cutoff) return null;

  const source: StateIntelligenceRecord["source"] = portal
    ? "state_portal"
    : "state_serper";
  const signalType = classifySignal(text, portal);
  const key = normalizedUrl(result.link);
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 24);

  return {
    externalId: `state-${stateCode.toLowerCase()}-${hash}`,
    stateCode,
    signalType,
    source,
    agency: portal?.name ?? result.source?.trim() ?? `${stateName} Government`,
    title: result.title.trim(),
    summary: result.snippet.trim() || null,
    sourceUrl: result.link,
    publishedDate,
    relevanceScore: assessment.score,
    rawData: {
      stateName,
      portalId: portal?.id ?? null,
      portalName: portal?.name ?? null,
      discoveryMode: result.discoveryMode,
      discoveryQuery: result.discoveryQuery,
      serperDate: result.date ?? null,
      sourceName: result.source ?? null,
    },
  };
}

export async function fetchStateIntelligence(options: {
  stateCode: string;
  dateRange?: number;
  keywords?: string;
  limit?: number;
}): Promise<StateIntelligenceFetchResult> {
  const stateCode = options.stateCode.trim().toUpperCase();
  const stateName = STATE_NAMES[stateCode];
  if (!stateName) {
    return {
      records: [],
      errors: [`Unknown state code: ${stateCode || "(blank)"}`],
      sources: [],
    };
  }

  if (!(await serperProvider.isConfigured())) {
    return {
      records: [],
      errors: ["Serper API key not configured; state intelligence discovery is disabled."],
      sources: [],
    };
  }

  const dateRange = Math.min(365, Math.max(1, Math.floor(options.dateRange ?? 30)));
  const limit = Math.min(MAX_RESULTS, Math.max(1, Math.floor(options.limit ?? MAX_RESULTS)));
  const portals = portalsForState(stateCode);
  const queries = buildQueries(stateCode, stateName, portals, options.keywords);
  const errors: string[] = [];
  const discovered: DiscoveredStateResult[] = [];
  const tbs = dateRange <= 7 ? "qdr:w" : dateRange <= 31 ? "qdr:m" : undefined;

  const batches = await Promise.all(
    queries.map(async ({ query, mode, type }) => {
      try {
        const results = await serperProvider.search(query, 10, { type, tbs });
        return results.map((result) => ({
          ...result,
          discoveryQuery: query,
          discoveryMode: mode,
        }));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(`${mode}: ${reason}`);
        return [] as DiscoveredStateResult[];
      }
    }),
  );
  discovered.push(...batches.flat());

  const now = new Date();
  const seen = new Set<string>();
  const records: StateIntelligenceRecord[] = [];

  for (const result of discovered) {
    const key = normalizedUrl(result.link);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const record = resultToRecord(
      result,
      stateCode,
      stateName,
      portals,
      dateRange,
      now,
    );
    if (!record) continue;
    records.push(record);
    if (records.length >= limit) break;
  }

  records.sort((a, b) => {
    const scoreDifference = b.relevanceScore - a.relevanceScore;
    if (scoreDifference !== 0) return scoreDifference;
    return (b.publishedDate?.getTime() ?? 0) - (a.publishedDate?.getTime() ?? 0);
  });

  return {
    records,
    errors,
    sources: Array.from(new Set(records.map((record) => record.source))),
  };
}
