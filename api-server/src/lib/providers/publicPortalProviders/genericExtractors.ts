import { createHash } from "crypto";

import type { NormalizedOpportunity } from "../types";
import type { PublicPortalSource } from "./catalog";

const PROCUREMENT_TERMS = ["RFP", "RFQ", "RFB", "IFB", "ITB", "bid", "bids", "solicitation", "request for proposal", "request for qualifications", "request for bid", "request for quote", "current opportunities", "open bids", "bid opportunities"];
const OCCU_MED_TERMS = ["occupational health", "occupational medicine", "medical services", "medical exams", "physical exams", "pre-employment physical", "fitness for duty", "drug testing", "drug screening", "alcohol testing", "DOT physical", "DOT drug testing", "employee health", "medical surveillance", "respirator fit testing", "pulmonary function", "spirometry", "audiometric testing", "hearing conservation", "vaccinations", "immunizations", "TB testing", "laboratory testing", "x-ray", "radiology", "EKG", "firefighter physical", "police physical", "public safety medical exams"];
const NAVIGATION_TITLES = new Set([
  "about",
  "account",
  "awards",
  "bid results",
  "contact",
  "doing business",
  "home",
  "how to bid",
  "log in",
  "login",
  "procurement",
  "purchasing",
  "register",
  "registration",
  "sign in",
  "supplier registration",
  "vendor registration",
]);
const NAVIGATION_PATH_TOKENS = [
  "/about",
  "/account",
  "/award",
  "/contact",
  "/help",
  "/login",
  "/privacy",
  "/register",
  "/signin",
  "/terms",
  "/vendor-registration",
];
const UNKNOWN_POSTED_DATE = new Date(0);

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

function isNavigationLink(title: string, url: string): boolean {
  const normalizedTitle = title.toLowerCase().replace(/\s+/g, " ").trim();
  if (NAVIGATION_TITLES.has(normalizedTitle)) return true;
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`.toLowerCase();
    return NAVIGATION_PATH_TOKENS.some((token) => path.includes(token));
  } catch {
    return true;
  }
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
  if (scraperType === "existing_parser") return "Dedicated Public Parser";
  if (scraperType === "scrapy") return "Scrapy Public Portal";
  return "Generic Public-Page Extraction";
}

function providerType(scraperType: PublicPortalSource["scraperType"]): string {
  if (scraperType === "scrapy") return "scrapy_public_crawler";
  return scraperType;
}

function uniqueTags(value: unknown, additions: string[]): string[] {
  const existing = Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
  return Array.from(new Set([...existing, ...additions]));
}

export function withPublicPortalMetadata(record: NormalizedOpportunity, source: PublicPortalSource): NormalizedOpportunity {
  const haystack = `${record.title} ${record.description ?? ""}`;
  const occuMedMatched = containsAny(haystack, OCCU_MED_TERMS);
  const existingConfidence = record.rawData?.sourceConfidence;
  return {
    ...record,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      ...(record.rawData ?? {}),
      providerName: "publicPortalProviders",
      providerFamily: "public_portal",
      providerType: providerType(source.scraperType),
      discoveryMethod: source.scraperType === "existing_parser" ? "dedicated_official_adapter" : "generic_official_page_extraction",
      sourceBadge: sourceBadge(source.scraperType),
      sourceId: source.id,
      agencyName: source.agencyName,
      scraperType: source.scraperType,
      sourceConfidence: existingConfidence === "high" || existingConfidence === "medium" || existingConfidence === "low"
        ? existingConfidence
        : source.scraperType === "existing_parser" ? "high" : "medium",
      tags: uniqueTags(record.rawData?.tags, [
        "official-procurement-portal",
        source.scraperType === "existing_parser" ? "dedicated-adapter" : "generic-page-extraction",
      ]),
      occuMedMatched,
      occuMedMatchTerms: OCCU_MED_TERMS.filter((term) => haystack.toLowerCase().includes(term.toLowerCase())),
    },
  };
}

export function extractStaticHtmlOpportunities(html: string, source: PublicPortalSource, limit: number): NormalizedOpportunity[] {
  const anchors = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const records: NormalizedOpportunity[] = [];
  anchors.forEach((anchor) => {
    const title = stripTags(anchor[2]);
    const url = absolutize(anchor[1], source.sourceUrl);
    if (!title || !url || title.length < 8 || isNavigationLink(title, url) || !containsAny(`${title} ${url}`, PROCUREMENT_TERMS)) return;
    const start = Math.max((anchor.index ?? 0) - 400, 0);
    const end = Math.min((anchor.index ?? 0) + anchor[0].length + 800, html.length);
    const snippet = stripTags(html.slice(start, end)).slice(0, 1200);
    const postedDate = extractDate(snippet, ["posted", "issue date", "published"]);
    const urlKey = url.toLowerCase().replace(/#.*$/, "");
    const urlHash = createHash("sha256").update(`${source.id}::${urlKey}`).digest("hex").slice(0, 24);
    records.push(withPublicPortalMetadata({
      externalId: `public-page-${urlHash}`,
      title,
      agency: source.agencyName,
      type: "Solicitation",
      status: "active",
      postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
      responseDeadline: extractDate(snippet, ["due", "deadline", "closing", "response deadline"]),
      solicitationNumber: extractSolicitationNumber(snippet),
      sourceUrl: url,
      description: snippet,
      source: "publicPortalProviders",
      rawData: {
        documentUrls: [],
        dateUnknown: !postedDate,
        tags: postedDate ? [] : ["date-unknown"],
      },
    }, source));
  });
  return records.slice(0, limit);
}

export function extractPdfLinkOpportunities(html: string, source: PublicPortalSource, limit: number): NormalizedOpportunity[] {
  return extractStaticHtmlOpportunities(html, source, limit).filter((record) => /\.pdf(?:$|[?#])/i.test(record.sourceUrl ?? "") || containsAny(record.description ?? "", ["pdf", "document"]));
}
