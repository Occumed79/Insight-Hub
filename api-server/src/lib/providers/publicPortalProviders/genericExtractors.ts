import type { NormalizedOpportunity } from "../types";
import type { PublicPortalSource } from "./catalog";

const PROCUREMENT_TERMS = ["RFP", "RFQ", "RFB", "IFB", "ITB", "bid", "bids", "solicitation", "request for proposal", "request for qualifications", "request for bid", "request for quote", "current opportunities", "open bids", "bid opportunities", "purchasing", "procurement"];
const OCCU_MED_TERMS = ["occupational health", "occupational medicine", "medical services", "medical exams", "physical exams", "pre-employment physical", "fitness for duty", "drug testing", "drug screening", "alcohol testing", "DOT physical", "DOT drug testing", "employee health", "medical surveillance", "respirator fit testing", "pulmonary function", "spirometry", "audiometric testing", "hearing conservation", "vaccinations", "immunizations", "TB testing", "laboratory testing", "x-ray", "radiology", "EKG", "firefighter physical", "police physical", "public safety medical exams"];

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function absolutize(href: string, baseUrl: string): string | undefined {
  try { return new URL(href, baseUrl).toString(); } catch { return undefined; }
}

function containsAny(value: string, terms: string[]): boolean {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function extractDate(text: string, labels: string[]): Date | undefined {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*:?\\s*([A-Z][a-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})`, "i"));
    if (match) {
      const parsed = new Date(match[1]);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return undefined;
}

function extractSolicitationNumber(text: string): string | undefined {
  return text.match(/(?:solicitation|bid|rfp|rfq|ifb|itb|number|no\.)\s*#?\s*:?\s*([A-Z0-9][A-Z0-9_.-]{3,})/i)?.[1];
}

function sourceBadge(scraperType: PublicPortalSource["scraperType"]): string {
  if (scraperType === "pdf_links") return "Public PDF Link";
  if (scraperType === "existing_parser") return "Direct Public Parser";
  if (scraperType === "scrapy") return "Scrapy Public Portal";
  return "Public Portal";
}

function providerType(scraperType: PublicPortalSource["scraperType"]): string {
  if (scraperType === "scrapy") return "scrapy_public_crawler";
  return scraperType;
}

export function withPublicPortalMetadata(record: NormalizedOpportunity, source: PublicPortalSource): NormalizedOpportunity {
  const haystack = `${record.title} ${record.description ?? ""}`;
  const occuMedMatched = containsAny(haystack, OCCU_MED_TERMS);
  return {
    ...record,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      ...(record.rawData ?? {}),
      providerFamily: "public_portal",
      providerType: providerType(source.scraperType),
      sourceBadge: sourceBadge(source.scraperType),
      sourceId: source.id,
      agencyName: source.agencyName,
      scraperType: source.scraperType,
      occuMedMatched,
      occuMedMatchTerms: OCCU_MED_TERMS.filter((term) => haystack.toLowerCase().includes(term.toLowerCase())),
    },
  };
}

export function extractStaticHtmlOpportunities(html: string, source: PublicPortalSource, limit: number): NormalizedOpportunity[] {
  const anchors = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const records: NormalizedOpportunity[] = [];
  anchors.forEach((anchor, index) => {
    const title = stripTags(anchor[2]);
    const url = absolutize(anchor[1], source.sourceUrl);
    if (!title || !url || !containsAny(`${title} ${url}`, PROCUREMENT_TERMS)) return;
    const start = Math.max((anchor.index ?? 0) - 400, 0);
    const end = Math.min((anchor.index ?? 0) + anchor[0].length + 800, html.length);
    const snippet = stripTags(html.slice(start, end)).slice(0, 1200);
    records.push(withPublicPortalMetadata({
      externalId: `${source.id}-${index}-${Buffer.from(url).toString("base64url").slice(0, 20)}`,
      title,
      agency: source.agencyName,
      type: "Solicitation",
      status: "active",
      postedDate: extractDate(snippet, ["posted", "issue date", "published"]) ?? new Date(),
      responseDeadline: extractDate(snippet, ["due", "deadline", "closing", "response deadline"]),
      solicitationNumber: extractSolicitationNumber(snippet),
      sourceUrl: url,
      description: snippet,
      source: "publicPortalProviders",
      rawData: { documentUrls: [] },
    }, source));
  });
  return records.slice(0, limit);
}

export function extractPdfLinkOpportunities(html: string, source: PublicPortalSource, limit: number): NormalizedOpportunity[] {
  return extractStaticHtmlOpportunities(html, source, limit).filter((record) => /\.pdf(?:$|[?#])/i.test(record.sourceUrl ?? "") || containsAny(record.description ?? "", ["pdf", "document"]));
}
