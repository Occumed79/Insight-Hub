import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";

const GOVBID_BASE_URL = "https://govbid.ca";
const RESULTS_PER_PAGE = 20;
const MAX_PAGES_PER_MARKET = 5;
const REQUEST_TIMEOUT_MS = 15_000;

const MARKET_PAGES = [
  { path: "/tenders/usa/healthcare-medical", country: "United States" },
  { path: "/tenders/canada/healthcare-medical", country: "Canada" },
] as const;

const DEFAULT_OCCUMED_TERMS = [
  "occupational health",
  "occupational medicine",
  "medical examination",
  "medical examinations",
  "physical examination",
  "physical examinations",
  "pre-employment physical",
  "pre employment physical",
  "fitness for duty",
  "fit for duty",
  "drug testing",
  "drug screening",
  "alcohol testing",
  "dot physical",
  "employee health",
  "medical surveillance",
  "respirator fit testing",
  "pulmonary function",
  "spirometry",
  "audiometric testing",
  "hearing conservation",
  "vaccination",
  "immunization",
  "tb testing",
  "laboratory testing",
  "firefighter physical",
  "police physical",
  "public safety medical",
];

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function extractSolicitationNumber(text: string): string | undefined {
  return text.match(/\b(?:RFP|RFQ|RFB|IFB|ITB|SOLICITATION|BID)\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,})\b/i)?.[1];
}

function hostFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function focusTerms(options: FetchOptions): string[] {
  const requested = options.keywords?.trim();
  if (!requested) return DEFAULT_OCCUMED_TERMS;
  return Array.from(new Set([requested, ...requested.split(/[;,]/).map((term) => term.trim()).filter(Boolean)]));
}

function matchesFocus(record: NormalizedOpportunity, terms: string[]): boolean {
  const haystack = `${record.title} ${record.agency} ${record.description ?? ""}`.toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function isOpen(record: NormalizedOpportunity): boolean {
  if (!record.responseDeadline) return true;
  const deadline = new Date(record.responseDeadline);
  deadline.setHours(23, 59, 59, 999);
  return deadline.getTime() >= Date.now();
}

function parseTenderPage(html: string, country: string): NormalizedOpportunity[] {
  const anchors = Array.from(
    html.matchAll(/<a\b[^>]*href=["'](\/tender\/([0-9a-f-]{36}))["'][^>]*>([\s\S]*?)<\/a>/gi),
  );
  const records: NormalizedOpportunity[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < anchors.length; index++) {
    const anchor = anchors[index];
    const govBidId = anchor[2].toLowerCase();
    const title = stripTags(anchor[3]);
    if (!title || /^view details$/i.test(title) || seen.has(govBidId)) continue;
    seen.add(govBidId);

    const start = anchor.index ?? 0;
    const nextStart = anchors.slice(index + 1).find((candidate) => candidate[2].toLowerCase() !== govBidId)?.index;
    const end = Math.min(nextStart ?? start + 3_500, start + 3_500, html.length);
    const chunk = html.slice(start, end);
    const text = stripTags(chunk);

    const afterTitle = text.toLowerCase().startsWith(title.toLowerCase())
      ? text.slice(title.length).trim()
      : text;
    const closesMatch = afterTitle.match(/\bCloses\s+([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i);
    const closesIndex = closesMatch?.index ?? -1;
    const agency = (closesIndex >= 0 ? afterTitle.slice(0, closesIndex) : "")
      .replace(/\bCloses in\s+\d+\s+d(?:ays?)?\b/gi, "")
      .trim() || "Government Agency";

    const detailUrl = `${GOVBID_BASE_URL}/tender/${govBidId}`;
    const sourceMatch = chunk.match(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>\s*(?:<[^>]+>\s*)*View source notice/i);
    const originalSourceUrl = sourceMatch ? decodeHtml(sourceMatch[1]) : undefined;

    let description = closesMatch
      ? afterTitle.slice((closesMatch.index ?? 0) + closesMatch[0].length)
      : afterTitle;
    description = description
      .replace(/\bView details\b[\s\S]*$/i, "")
      .replace(new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
      .trim();

    const deadline = parseDate(closesMatch?.[1]);
    const sourceUrl = originalSourceUrl ?? detailUrl;
    const combined = `${title} ${description}`;

    records.push({
      externalId: `govbid-${govBidId}`,
      title,
      agency,
      type: "Solicitation",
      status: "active",
      postedDate: new Date(),
      responseDeadline: deadline,
      placeOfPerformance: country,
      location: country,
      description: description || undefined,
      solicitationNumber: extractSolicitationNumber(combined),
      sourceUrl,
      source: "govBid",
      providerName: "govBid",
      rawData: {
        govBidId,
        govBidUrl: detailUrl,
        originalSourceUrl,
        originalSourceHost: hostFromUrl(originalSourceUrl),
        country,
        discoveryMethod: "authorized_public_listing",
      },
    });
  }

  return records;
}

export class GovBidProvider implements DataSourceProvider {
  readonly name = "govBid" as const;

  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private lastError?: string;
  private recordCount = 0;

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const pagesPerMarket = Math.min(MAX_PAGES_PER_MARKET, Math.max(1, Math.ceil(limit / RESULTS_PER_PAGE)));
    const errors: string[] = [];
    const records: NormalizedOpportunity[] = [];
    const seen = new Set<string>();

    for (const market of MARKET_PAGES) {
      for (let page = 1; page <= pagesPerMarket; page++) {
        const url = `${GOVBID_BASE_URL}${market.path}${page > 1 ? `?page=${page}` : ""}`;
        try {
          const response = await fetch(url, {
            headers: {
              Accept: "text/html,application/xhtml+xml",
              "User-Agent": "Occu-Med Insight Hub/1.0 (authorized GovBid integration)",
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          if (!response.ok) {
            errors.push(`${url}: HTTP ${response.status}`);
            continue;
          }

          const pageRecords = parseTenderPage(await response.text(), market.country);
          if (pageRecords.length === 0) break;
          for (const record of pageRecords) {
            if (seen.has(record.externalId)) continue;
            seen.add(record.externalId);
            records.push(record);
          }
        } catch (error) {
          errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    const terms = focusTerms(options);
    const filtered = records.filter((record) => isOpen(record) && matchesFocus(record, terms)).slice(0, limit);
    this.recordCount = filtered.length;

    if (filtered.length > 0) {
      this.lastSuccess = new Date();
      this.lastError = undefined;
    } else if (errors.length > 0) {
      this.lastError = errors.join("; ").slice(0, 1_000);
    }

    return { records: filtered, total: filtered.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: true,
      healthy: !this.lastError,
      errorMessage: this.lastError,
      lastAttempt: this.lastAttempt,
      lastSuccess: this.lastSuccess,
      recordCount: this.recordCount,
    };
  }
}

export const govBidProvider = new GovBidProvider();
