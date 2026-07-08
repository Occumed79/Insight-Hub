import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";

const ESBD_URL = "https://www.txsmartbuy.gov/esbd";
const ESBD_BASE_URL = "https://www.txsmartbuy.gov";
const DEFAULT_LIMIT = 50;

const ACTIVE_STATUSES = new Set(["posted", "addendum posted", "pre-solicitation", "presolicitation"]);

interface TexasEsbdRow {
  title: string;
  solicitationId: string;
  dueDate?: string;
  dueTime?: string;
  agencyMemberNumber?: string;
  status?: string;
  postingDate?: string;
  createdDate?: string;
  lastUpdated?: string;
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
    "Solicitation ID", "Due Date", "Due Time", "Agency/Texas SmartBuy Member Number",
    "Status", "Posting Date", "Created Date", "Last Updated",
  ];
  const otherLabels = labels.filter((candidate) => candidate !== label).map(escapeRegex).join("|");
  const pattern = new RegExp(`${escapeRegex(label)}:\\s*([\\s\\S]*?)(?=\\s+(?:${otherLabels}):|$)`, "i");
  const match = blockText.match(pattern);
  return match?.[1]?.replace(/^\|\s*/, "").trim() || undefined;
}

function parseTexasDate(dateValue?: string, timeValue?: string): Date | undefined {
  if (!dateValue) return undefined;
  const cleanedDate = dateValue.trim();
  const cleanedTime = timeValue?.trim();
  const candidate = cleanedTime ? `${cleanedDate} ${cleanedTime}` : cleanedDate;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isProbablyRelevant(row: TexasEsbdRow, keywords?: string): boolean {
  const haystack = `${row.title} ${row.solicitationId} ${row.status ?? ""}`.toLowerCase();
  const keywordParts = (keywords ?? "")
    .toLowerCase()
    .split(/[\s,|]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);

  if (keywordParts.length === 0) return true;
  return keywordParts.some((part) => haystack.includes(part));
}

function parseEsbdRows(html: string): TexasEsbdRow[] {
  const anchors = Array.from(html.matchAll(/<a\b[^>]*href="([^"]*\/esbd\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi));
  const rows: TexasEsbdRow[] = [];

  for (let index = 0; index < anchors.length; index++) {
    const anchor = anchors[index];
    const href = anchor[1];
    const title = stripTags(anchor[2]);
    if (!title || /^(\d+|\.\.\.)$/.test(title)) continue;

    const start = anchor.index ?? 0;
    const nextStart = anchors[index + 1]?.index ?? html.length;
    const blockHtml = html.slice(start, nextStart);
    const blockText = stripTags(blockHtml);
    const solicitationId = fieldValue(blockText, "Solicitation ID");
    if (!solicitationId) continue;

    const sourceUrl = href.startsWith("http") ? href : `${ESBD_BASE_URL}${href}`;
    rows.push({
      title,
      solicitationId,
      dueDate: fieldValue(blockText, "Due Date"),
      dueTime: fieldValue(blockText, "Due Time"),
      agencyMemberNumber: fieldValue(blockText, "Agency/Texas SmartBuy Member Number"),
      status: fieldValue(blockText, "Status"),
      postingDate: fieldValue(blockText, "Posting Date"),
      createdDate: fieldValue(blockText, "Created Date"),
      lastUpdated: fieldValue(blockText, "Last Updated"),
      sourceUrl,
    });
  }

  return rows;
}

function rowToOpportunity(row: TexasEsbdRow): NormalizedOpportunity | null {
  const normalizedStatus = row.status?.toLowerCase().trim() ?? "";
  if (normalizedStatus && !ACTIVE_STATUSES.has(normalizedStatus)) return null;

  const responseDeadline = parseTexasDate(row.dueDate, row.dueTime);
  if (responseDeadline && responseDeadline < new Date()) return null;

  const postedDate = parseTexasDate(row.postingDate) ?? parseTexasDate(row.createdDate) ?? new Date();
  const agency = row.agencyMemberNumber ? `Texas SmartBuy Member ${row.agencyMemberNumber}` : "Texas SmartBuy Member";

  return {
    externalId: `tx-esbd-${row.solicitationId}`,
    title: row.title,
    agency,
    type: "Solicitation",
    status: "active",
    postedDate,
    responseDeadline,
    solicitationNumber: row.solicitationId,
    sourceUrl: row.sourceUrl,
    description: [
      row.title,
      `Solicitation ID: ${row.solicitationId}`,
      row.status ? `Status: ${row.status}` : null,
      row.dueDate ? `Due Date: ${row.dueDate}${row.dueTime ? ` ${row.dueTime}` : ""}` : null,
      row.postingDate ? `Posting Date: ${row.postingDate}` : null,
      row.agencyMemberNumber ? `Agency/Texas SmartBuy Member Number: ${row.agencyMemberNumber}` : null,
    ].filter(Boolean).join("\n"),
    source: "texasEsbd" as any,
    rawData: {
      providerName: "texas_esbd_direct_parser",
      portalName: "Texas ESBD / Texas SmartBuy",
      portalState: "TX",
      sourceId: "tx-esbd",
      sourceConfidence: "high",
      tags: ["direct-official-portal", "state:TX", "texas-esbd", "parser:texas-esbd"],
      notes: "Parsed directly from the official Texas ESBD / Texas SmartBuy solicitation listing.",
      texasEsbd: row,
    },
  };
}

export class TexasEsbdProvider implements DataSourceProvider {
  readonly name = "texasEsbd" as any;

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT);
    const response = await fetch(ESBD_URL, {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "OccuMed-InsightHub/1.0 (+https://www.occumed.com)",
      },
    });

    if (!response.ok) {
      return { records: [], total: 0, errors: [`Texas ESBD returned HTTP ${response.status}`] };
    }

    const html = await response.text();
    const rows = parseEsbdRows(html)
      .filter((row) => isProbablyRelevant(row, options.keywords))
      .slice(0, limit);
    const records = rows
      .map(rowToOpportunity)
      .filter((record): record is NormalizedOpportunity => Boolean(record));

    return { records, total: records.length, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: "texasEsbd" as any,
      configured: true,
      healthy: true,
    };
  }
}

export const texasEsbdProvider = new TexasEsbdProvider();
