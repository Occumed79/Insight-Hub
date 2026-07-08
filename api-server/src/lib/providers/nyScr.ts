import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";

const NYSCR_SEARCH_URL = "https://www.nyscr.ny.gov/Ads/Search";
const DEFAULT_LIMIT = 50;

interface NyScrRow {
  title: string;
  crNumber: string;
  agency?: string;
  company?: string;
  division?: string;
  issueDate?: string;
  dueDate?: string;
  location?: string;
  category?: string;
  adType?: string;
  note?: string;
  sourceUrl: string;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fieldValue(blockText: string, label: string): string | undefined {
  const labels = [
    "Title", "Note", "CR#", "Agency", "Company", "Division", "Issue date", "Due date", "Location", "Category", "Ad type",
  ];
  const otherLabels = labels.filter((candidate) => candidate !== label).map(escapeRegex).join("|");
  const pattern = new RegExp(`${escapeRegex(label)}:\\s*([\\s\\S]*?)(?=\\s+(?:${otherLabels}):|\\s+Log in or sign up to view this opportunity|$)`, "i");
  const match = blockText.match(pattern);
  return match?.[1]?.replace(/^\|\s*/, "").trim() || undefined;
}

function parseNyDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseNyScrRows(html: string): NyScrRow[] {
  const text = stripTags(html);
  const rowMatches = Array.from(text.matchAll(/(?:^|\s)(\d{2})\s+Title:\s+/g));
  const rows: NyScrRow[] = [];

  for (let index = 0; index < rowMatches.length; index++) {
    const start = rowMatches[index].index ?? 0;
    const nextStart = rowMatches[index + 1]?.index ?? text.length;
    const blockText = text.slice(start, nextStart).trim();

    const title = fieldValue(blockText, "Title");
    const crNumber = fieldValue(blockText, "CR#");
    if (!title || !crNumber) continue;

    rows.push({
      title,
      crNumber,
      agency: fieldValue(blockText, "Agency"),
      company: fieldValue(blockText, "Company"),
      division: fieldValue(blockText, "Division"),
      issueDate: fieldValue(blockText, "Issue date"),
      dueDate: fieldValue(blockText, "Due date"),
      location: fieldValue(blockText, "Location"),
      category: fieldValue(blockText, "Category"),
      adType: fieldValue(blockText, "Ad type"),
      note: fieldValue(blockText, "Note"),
      sourceUrl: `${NYSCR_SEARCH_URL}#cr-${encodeURIComponent(crNumber)}`,
    });
  }

  return rows;
}

function rowToOpportunity(row: NyScrRow): NormalizedOpportunity | null {
  const responseDeadline = parseNyDate(row.dueDate);
  if (responseDeadline && responseDeadline < new Date()) return null;

  const postedDate = parseNyDate(row.issueDate) ?? new Date();
  const agency = row.agency ?? row.company ?? "New York State Contract Reporter";

  return {
    externalId: `ny-scr-${row.crNumber}`,
    title: row.title,
    agency,
    subAgency: row.division,
    type: row.adType ?? "Solicitation",
    status: "active",
    postedDate,
    responseDeadline,
    placeOfPerformance: row.location,
    solicitationNumber: row.crNumber,
    sourceUrl: row.sourceUrl,
    description: [
      row.title,
      row.note ? `Note: ${row.note}` : null,
      `CR#: ${row.crNumber}`,
      row.agency ? `Agency: ${row.agency}` : null,
      row.company ? `Company: ${row.company}` : null,
      row.division ? `Division: ${row.division}` : null,
      row.issueDate ? `Issue date: ${row.issueDate}` : null,
      row.dueDate ? `Due date: ${row.dueDate}` : null,
      row.location ? `Location: ${row.location}` : null,
      row.category ? `Category: ${row.category}` : null,
      row.adType ? `Ad type: ${row.adType}` : null,
      "Detailed ad view may require a free NYSCR account.",
    ].filter(Boolean).join("\n"),
    source: "nyScr",
    rawData: {
      providerName: "ny_scr_direct_parser",
      portalName: "New York State Contract Reporter",
      portalState: "NY",
      sourceId: "ny-contract-reporter",
      sourceConfidence: "high",
      tags: ["direct-official-portal", "state:NY", "ny-scr", "parser:ny-scr"],
      notes: "Parsed from the official New York State Contract Reporter public open-opportunity listing. Detailed ad view may require a free NYSCR account.",
      nyScr: row,
    },
  };
}

export class NyScrProvider implements DataSourceProvider {
  readonly name = "nyScr" as const;

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT);
    const response = await fetch(NYSCR_SEARCH_URL, {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "OccuMed-InsightHub/1.0 (+https://www.occumed.com)",
      },
    });

    if (!response.ok) {
      return { records: [], total: 0, errors: [`NYSCR returned HTTP ${response.status}`] };
    }

    const html = await response.text();
    const rows = parseNyScrRows(html).slice(0, limit);
    const records = rows
      .map(rowToOpportunity)
      .filter((record): record is NormalizedOpportunity => Boolean(record));

    return { records, total: records.length, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: "nyScr",
      configured: true,
      healthy: true,
    };
  }
}

export const nyScrProvider = new NyScrProvider();
