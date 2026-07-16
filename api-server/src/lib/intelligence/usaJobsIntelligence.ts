import { createHash } from "crypto";

const USAJOBS_SEARCH_URL = "https://data.usajobs.gov/api/search";
const MAX_API_DATE_RANGE_DAYS = 60;
const DEFAULT_RESULT_LIMIT = 150;

const DEFAULT_SEARCH_TERMS = [
  "occupational health",
  "occupational medicine",
  "safety occupational health",
  "industrial hygiene",
  "medical surveillance",
  "employee health",
  "public health advisor",
  "medical officer",
  "preventive medicine",
  "deployment health",
];

const HIGH_SIGNAL_PATTERNS = [
  /occupational health/i,
  /occupational medicine/i,
  /safety and occupational health|safety occupational health/i,
  /industrial hygien/i,
  /medical surveillance|health surveillance/i,
  /employee health|workforce health/i,
  /fitness for duty|fit for duty/i,
  /pre[- ]employment (physical|medical|screening)/i,
  /drug testing|drug screening|alcohol testing/i,
  /medical officer/i,
  /public health advisor|public health analyst/i,
  /preventive medicine/i,
  /deployment health|force health protection/i,
  /health physicist|radiation safety/i,
  /audiometric|hearing conservation|spirometry|respirator fit/i,
];

const PRIORITY_AGENCY_PATTERN =
  /department of defense|department of the army|department of the navy|department of the air force|defense health agency|department of veterans affairs|department of homeland security|department of labor|occupational safety and health administration|centers for disease control|health resources and services administration/i;

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

function isRelevant(descriptor: UsaJobsDescriptor): boolean {
  const text = recordText(descriptor);
  return HIGH_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

function relevanceScore(descriptor: UsaJobsDescriptor): number {
  const text = recordText(descriptor);
  const title = descriptor.PositionTitle ?? "";
  const matchedSignals = HIGH_SIGNAL_PATTERNS.filter((pattern) => pattern.test(text)).length;
  const titleMatch = HIGH_SIGNAL_PATTERNS.some((pattern) => pattern.test(title));
  const priorityAgency = PRIORITY_AGENCY_PATTERN.test(
    `${descriptor.OrganizationName ?? ""} ${descriptor.DepartmentName ?? ""}`,
  );
  const multipleLocations = (descriptor.PositionLocation?.length ?? 0) > 1;

  return Math.min(
    98,
    52 + matchedSignals * 7 + (titleMatch ? 12 : 0) + (priorityAgency ? 7 : 0) + (multipleLocations ? 3 : 0),
  );
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
  if (!isRelevant(descriptor)) return null;

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
    relevanceScore: relevanceScore(descriptor),
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
      ...DEFAULT_SEARCH_TERMS,
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
