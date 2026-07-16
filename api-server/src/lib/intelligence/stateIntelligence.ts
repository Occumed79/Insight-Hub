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

const SERVICE_EXPRESSION =
  '("occupational health" OR "occupational medicine" OR "employee health" OR "medical surveillance" OR "fitness for duty" OR "pre-employment physical" OR "drug testing" OR "alcohol testing" OR audiometric OR spirometry OR "respirator fit testing")';
const PROCUREMENT_EXPRESSION =
  "(RFP OR RFQ OR bid OR solicitation OR procurement OR contract opportunity)";
const POLICY_EXPRESSION =
  '(grant OR funding OR budget OR regulation OR rulemaking OR guidance OR enforcement OR "workplace health")';

const SERVICE_PATTERNS = [
  /occupational health|occupational medicine|employee health/i,
  /drug test|drug screen|alcohol test|substance abuse testing/i,
  /pre[- ]employment|fitness for duty|fit for duty|medical examination/i,
  /medical surveillance|health surveillance|workplace health/i,
  /audiometric|hearing conservation|spirometry|pulmonary function|respirator fit/i,
  /deployment medical|periodic health assessment|military physical/i,
];

const REJECT_PATTERN =
  /\b(award notice|intent to award|contract awarded|bid tabulation|closed solicitation|cancelled solicitation|job opening|now hiring|career opportunity)\b/i;

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

function matchesOccuMedServices(text: string): boolean {
  return SERVICE_PATTERNS.some((pattern) => pattern.test(text));
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

function relevanceScore(
  text: string,
  portal: DirectRfpPortal | undefined,
  publishedDate: Date | null,
  now: Date,
): number {
  const serviceMatches = SERVICE_PATTERNS.filter((pattern) => pattern.test(text)).length;
  const portalBonus = portal ? 10 : 0;
  const recentBonus =
    publishedDate && now.getTime() - publishedDate.getTime() <= 30 * DAY_MS ? 5 : 0;
  return Math.min(95, 50 + serviceMatches * 7 + portalBonus + recentBonus);
}

function buildQueries(
  stateCode: string,
  stateName: string,
  portals: DirectRfpPortal[],
  keywords?: string,
): Array<{ query: string; mode: DiscoveredStateResult["discoveryMode"]; type?: "news" }> {
  const keywordExpression = keywords?.trim() ? ` (${keywords.trim()})` : "";
  const queries: Array<{
    query: string;
    mode: DiscoveredStateResult["discoveryMode"];
    type?: "news";
  }> = [];

  const portalDomains = Array.from(new Set(portals.map((portal) => portal.domain))).slice(0, 8);
  if (portalDomains.length > 0) {
    const domains = portalDomains.map((domain) => `site:${domain}`).join(" OR ");
    queries.push({
      query: `(${domains}) ${SERVICE_EXPRESSION} ${PROCUREMENT_EXPRESSION}${keywordExpression} -awarded -closed`,
      mode: "portal",
    });
  }

  queries.push({
    query: `"${stateName}" ${SERVICE_EXPRESSION} ${POLICY_EXPRESSION}${keywordExpression} site:.gov`,
    mode: "government",
  });
  queries.push({
    query: `"${stateName}" ${SERVICE_EXPRESSION} (procurement OR grant OR regulation OR guidance)${keywordExpression}`,
    mode: "news",
    type: "news",
  });

  if (stateCode === "DC") {
    queries.push({
      query: `"District of Columbia" ${SERVICE_EXPRESSION} ${PROCUREMENT_EXPRESSION}${keywordExpression} site:dc.gov`,
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
  if (!matchesOccuMedServices(text)) return null;
  if (
    !portal &&
    !/\b(rfp|rfq|bid|solicitation|procurement|grant|funding|budget|regulation|rulemaking|guidance|enforcement|workplace health)\b/i.test(text)
  ) {
    return null;
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
    relevanceScore: relevanceScore(text, portal, publishedDate, now),
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
