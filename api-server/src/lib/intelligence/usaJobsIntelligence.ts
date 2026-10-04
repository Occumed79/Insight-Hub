import { createHash } from "crypto";

import { profileLeadQueries } from "../providers/profileQueryTerms";
import { evidenceScore, profileEvidence } from "./profileIntelRelevance";

const USAJOBS_SEARCH_URL = "https://data.usajobs.gov/api/search";
const MAX_API_DATE_RANGE_DAYS = 60;
const DEFAULT_RESULT_LIMIT = 150;

// Search terms and relevance both come from the Neon-backed relevance profile (read at call time):
// the profile's lead service queries drive the USAJOBS keyword searches, and a posting is relevant when it
// names profile service terms. No vocabulary or agency list is defined here.
const MAX_SEARCH_TERMS = 10;

interface UsaJobsLocation {
  LocationName?: string;
  CountryCode?: string;
  CountrySubDivisionCode?: string;
  CityName?: string;
}

interface UsaJobsCategory {
  Name?: string;
  Code?: string;
}

interface UsaJobsRemuneration {
  MinimumRange?: string;
  MaximumRange?: string;
  RateIntervalCode?: string;
  Description?: string;
}

interface UsaJobsDescriptor {
  PositionID?: string;
  PositionTitle?: string;
  PositionURI?: string;
  PositionLocationDisplay?: string;
  PositionLocation?: UsaJobsLocation[];
  OrganizationName?: string;
  DepartmentName?: string;
  JobCategory?: UsaJobsCategory[];
  JobGrade?: Array<{ Code?: string }>;
  PositionSchedule?: Array<{ Name?: string; Code?: string }>;
  PositionOfferingType?: Array<{ Name?: string; Code?: string }>;
  QualificationSummary?: string;
  PositionRemuneration?: UsaJobsRemuneration[];
  PublicationStartDate?: string;
  ApplicationCloseDate?: string;
  PositionFormattedDescription?: Array<{ Content?: string; Label?: string }>;
  UserArea?: {
    Details?: {
      MajorDuties?: string;
      JobSummary?: string;
      Requirements?: string;
      LowGrade?: string;
      HighGrade?: string;
      SubAgencyName?: string;
      OrganizationCodes?: string;
    };
  };
}

interface UsaJobsSearchItem {
  MatchedObjectId?: string;
  MatchedObjectDescriptor?: UsaJobsDescriptor;
  RelevanceRank?: number;
}

interface UsaJobsSearchResponse {
  SearchResult?: {
    SearchResultItems?: UsaJobsSearchItem[];
    SearchResultCount?: number;
    SearchResultCountAll?: number;
  };
}

export interface UsaJobsWorkforceRecord {
  externalId: string;
  title: string;
  agency: string;
  summary: string | null;
  sourceUrl: string | null;
  publishedDate: Date | null;
  relevanceScore: number;
  rawData: Record<string, unknown>;
}

export interface UsaJobsWorkforceFetchResult {
  records: UsaJobsWorkforceRecord[];
  errors: string[];
  configured: boolean;
}

function safeDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function formatSalary(remuneration: UsaJobsRemuneration[] | undefined): string | null {
  const first = remuneration?.[0];
  if (!first) return null;
  const minimum = Number(first.MinimumRange);
  const maximum = Number(first.MaximumRange);
  if (!Number.isFinite(minimum) && !Number.isFinite(maximum)) return null;

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const range = Number.isFinite(minimum) && Number.isFinite(maximum)
    ? `${currency.format(minimum)}–${currency.format(maximum)}`
    : Number.isFinite(minimum)
      ? `From ${currency.format(minimum)}`
      : `Up to ${currency.format(maximum)}`;
  return first.Description ? `${range} ${first.Description.toLowerCase()}` : range;
}

function recordText(descriptor: UsaJobsDescriptor): string {
  const details = descriptor.UserArea?.Details;
  return [
    descriptor.PositionTitle,
    descriptor.OrganizationName,
    descriptor.DepartmentName,
    descriptor.QualificationSummary,
    details?.JobSummary,
    details?.MajorDuties,
    details?.Requirements,
    ...(descriptor.JobCategory ?? []).map((category) => `${category.Name ?? ""} ${category.Code ?? ""}`),
    ...(descriptor.PositionFormattedDescription ?? []).map((entry) => entry.Content ?? ""),
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * A job posting is a workforce signal, not a procurement notice, so it is judged on profile evidence (the
 * service terms it names) rather than the procurement-notice rules. Returns null when it names none.
 */
function profileRelevance(descriptor: UsaJobsDescriptor): { score: number } | null {
  const evidence = profileEvidence(recordText(descriptor));
  if (evidence.total === 0) return null;
  return { score: evidenceScore(evidence) };
}

function buildSummary(descriptor: UsaJobsDescriptor): string | null {
  const details = descriptor.UserArea?.Details;
  const parts: string[] = [];
  const summary = normalizedText(details?.JobSummary) || normalizedText(descriptor.QualificationSummary);
  if (summary) parts.push(summary);

  const location = normalizedText(descriptor.PositionLocationDisplay);
  if (location) parts.push(`Location: ${location}.`);

  const categories = (descriptor.JobCategory ?? [])
    .map((category) => [category.Name, category.Code].filter(Boolean).join(" — "))
    .filter(Boolean)
    .slice(0, 3);
  if (categories.length > 0) parts.push(`Series: ${categories.join(", ")}.`);

  const grade = [details?.LowGrade, details?.HighGrade].filter(Boolean).join("–");
  if (grade) parts.push(`Grade: ${grade}.`);

  const salary = formatSalary(descriptor.PositionRemuneration);
  if (salary) parts.push(`Salary: ${salary}.`);

  const closingDate = safeDate(descriptor.ApplicationCloseDate);
  if (closingDate) {
    parts.push(
      `Closes: ${closingDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })}.`,
    );
  }

  if (parts.length === 0) return null;
  return parts.join(" ").slice(0, 1800);
}

function toRecord(item: UsaJobsSearchItem): UsaJobsWorkforceRecord | null {
  const descriptor = item.MatchedObjectDescriptor;
  if (!descriptor || !descriptor.PositionTitle?.trim()) return null;
  const relevance = profileRelevance(descriptor);
  if (!relevance) return null;

  const stableId = descriptor.PositionID?.trim() || item.MatchedObjectId?.trim();
  if (!stableId) return null;

  const agency =
    normalizedText(descriptor.OrganizationName) ||
    normalizedText(descriptor.DepartmentName) ||
    "Federal Agency";

  return {
    externalId: `usajobs-${stableId}`,
    title: descriptor.PositionTitle.trim(),
    agency,
    summary: buildSummary(descriptor),
    sourceUrl: descriptor.PositionURI?.trim() || null,
    publishedDate: safeDate(descriptor.PublicationStartDate),
    relevanceScore: relevance.score,
    rawData: {
      matchedObjectId: item.MatchedObjectId ?? null,
      relevanceRank: item.RelevanceRank ?? null,
      descriptor,
      departmentName: descriptor.DepartmentName ?? null,
      subAgencyName: descriptor.UserArea?.Details?.SubAgencyName ?? null,
      applicationCloseDate: descriptor.ApplicationCloseDate ?? null,
      locations: descriptor.PositionLocation ?? [],
    },
  };
}

function credentials(): { apiKey: string; userAgent: string } | null {
  const apiKey = process.env["USAJOBS_API_KEY"]?.trim();
  const userAgent = process.env["USAJOBS_USER_AGENT"]?.trim();
  if (!apiKey || !userAgent) return null;
  return { apiKey, userAgent };
}

async function searchTerm(options: {
  term: string;
  dateRange: number;
  apiKey: string;
  userAgent: string;
}): Promise<UsaJobsSearchItem[]> {
  const params = new URLSearchParams({
    Keyword: options.term,
    DatePosted: String(Math.min(MAX_API_DATE_RANGE_DAYS, Math.max(1, options.dateRange))),
    ResultsPerPage: "50",
    Fields: "Full",
    SortField: "opendate",
    SortDirection: "Desc",
    WhoMayApply: "Public",
  });

  const response = await fetch(`${USAJOBS_SEARCH_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      Host: "data.usajobs.gov",
      "User-Agent": options.userAgent,
      "Authorization-Key": options.apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}${body ? ` — ${body.slice(0, 180)}` : ""}`);
  }

  const payload = (await response.json()) as UsaJobsSearchResponse;
  return payload.SearchResult?.SearchResultItems ?? [];
}

export async function fetchUsaJobsWorkforceIntelligence(options: {
  dateRange?: number;
  keywords?: string;
  limit?: number;
}): Promise<UsaJobsWorkforceFetchResult> {
  const auth = credentials();
  if (!auth) {
    return {
      records: [],
      errors: [
        "USAJOBS is not configured. Set USAJOBS_API_KEY and USAJOBS_USER_AGENT to the approved API key and registration email.",
      ],
      configured: false,
    };
  }

  const dateRange = Math.min(
    MAX_API_DATE_RANGE_DAYS,
    Math.max(1, Math.floor(options.dateRange ?? 30)),
  );
  const limit = Math.min(300, Math.max(1, Math.floor(options.limit ?? DEFAULT_RESULT_LIMIT)));
  const terms = Array.from(
    new Set([
      ...(options.keywords?.trim() ? [options.keywords.trim()] : []),
      ...profileLeadQueries(MAX_SEARCH_TERMS),
    ]),
  );

  const errors: string[] = [];
  const seen = new Set<string>();
  const records: UsaJobsWorkforceRecord[] = [];

  // Deliberately sequential: the USAJOBS developer key is shared and should not be burst-called.
  for (const term of terms) {
    try {
      const items = await searchTerm({
        term,
        dateRange,
        apiKey: auth.apiKey,
        userAgent: auth.userAgent,
      });

      for (const item of items) {
        const record = toRecord(item);
        if (!record) continue;
        const key = createHash("sha256").update(record.externalId).digest("hex");
        if (seen.has(key)) continue;
        seen.add(key);
        records.push(record);
        if (records.length >= limit) break;
      }
      if (records.length >= limit) break;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push(`USAJOBS query "${term}": ${reason}`);
    }
  }

  records.sort((a, b) => {
    const scoreDifference = b.relevanceScore - a.relevanceScore;
    if (scoreDifference !== 0) return scoreDifference;
    return (b.publishedDate?.getTime() ?? 0) - (a.publishedDate?.getTime() ?? 0);
  });

  return { records, errors, configured: true };
}
