/**
 * Source Monitor Scraper Engine
 *
 * Lightweight fetch-based scraper for the curated source registry.
 * No external scraping libraries — uses plain fetch + regex/string extraction.
 */

import type { MonitoredSource } from "./registry";

export interface ScrapedItem {
  title: string;
  summary?: string;
  itemUrl?: string;
  publishedDate?: Date;
}

export interface ScrapeResult {
  status: "success" | "no_items_found" | "blocked" | "failed" | "timeout";
  items: ScrapedItem[];
  errorMessage?: string;
  rawHtml?: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 " +
  "InsightHub-SourceMonitor/1.0";

const LOW_VALUE_TITLES = new Set([
  "about",
  "accessibility",
  "account",
  "advertise opportunities",
  "advertise bids",
  "apply",
  "awards",
  "business registry",
  "careers",
  "contact",
  "create an account",
  "doing business with nys",
  "find bids",
  "find contracts",
  "history",
  "home",
  "how to apply",
  "log in",
  "login",
  "more information",
  "please click here",
  "policies and disclaimers",
  "privacy",
  "register",
  "sign in",
  "sitemap",
  "staff plans",
  "subscribe",
  "terms",
  "winners",
]);

const LOW_VALUE_HREF_PARTS = [
  "/about",
  "/accessibility",
  "/account",
  "/careers",
  "/contact",
  "/help",
  "/login",
  "/privacy",
  "/register",
  "/search",
  "/sign-in",
  "/signin",
  "/sitemap",
  "/terms",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "youtube.com",
];

const INTELLIGENCE_KEYWORDS = [
  "acquisition",
  "award",
  "awarded",
  "bid",
  "bids",
  "contract",
  "contracts",
  "contractor",
  "deadline",
  "delivery order",
  "dod",
  "federal register",
  "grant",
  "industry day",
  "medical",
  "notice",
  "opportunity",
  "procurement",
  "proposal",
  "rfi",
  "rfp",
  "rfq",
  "rule",
  "sam.gov",
  "solicitation",
  "sources sought",
  "task order",
  "vendor",
  "workforce",
];

function resolveUrl(base: string, href: string): string {
  try {
    if (href.startsWith("http")) return href;
    if (href.startsWith("//")) return new URL(base).protocol + href;
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function isSameDomain(a: string, b: string): boolean {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

function parseDate(raw: string): Date | undefined {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; text: string; headers: Headers }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, headers: res.headers };
}

function cleanText(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1), 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractXmlTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = regex.exec(xml);
  return m ? cleanText(m[1]) : undefined;
}

function extractXmlAttr(xml: string, tag: string, attr: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*)`, "i");
  const m = regex.exec(xml);
  return m ? cleanText(m[1]) : undefined;
}

function extractMeta(html: string, name: string): string | undefined {
  const regex = new RegExp(`<meta\\s+(?:name|property)=["']${name}["']\\s+content=["']([^"']*)["']`, "i");
  const m = regex.exec(html);
  return m ? cleanText(m[1]) : undefined;
}

function hasIntelligenceSignal(text: string, href: string): boolean {
  const combined = `${text} ${href}`.toLowerCase();
  return INTELLIGENCE_KEYWORDS.some((keyword) => combined.includes(keyword));
}

function isLowValueLink(title: string, href: string): boolean {
  const normalizedTitle = title.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedHref = href.toLowerCase();

  if (!normalizedTitle || normalizedTitle.length < 8) return true;
  if (LOW_VALUE_TITLES.has(normalizedTitle)) return true;
  if (LOW_VALUE_HREF_PARTS.some((part) => normalizedHref.includes(part))) return true;

  // Reject very generic one/two-word site-nav links unless the URL/text carries a real signal.
  const wordCount = normalizedTitle.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 2 && !hasIntelligenceSignal(normalizedTitle, normalizedHref)) return true;

  return false;
}

function extractBlockSummary(block: string, title: string): string | undefined {
  const text = cleanText(block).replace(title, "").trim();
  if (!text || text.length < 40) return undefined;
  return text.slice(0, 320);
}

function dedupeAndFilter(items: ScrapedItem[], baseUrl: string, maxItems: number): ScrapedItem[] {
  const seen = new Set<string>();
  const filtered: ScrapedItem[] = [];

  for (const item of items) {
    const title = cleanText(item.title ?? "");
    const url = item.itemUrl ? resolveUrl(baseUrl, item.itemUrl) : undefined;
    if (!title) continue;
    if (url && !isSameDomain(baseUrl, url)) continue;
    if (isLowValueLink(title, url ?? "")) continue;

    const key = `${url ?? ""}::${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    filtered.push({
      ...item,
      title,
      summary: item.summary ? cleanText(item.summary).slice(0, 320) : undefined,
      itemUrl: url,
    });
    if (filtered.length >= maxItems) break;
  }

  return filtered;
}

function extractFromRss(html: string, baseUrl: string, maxItems: number): ScrapedItem[] {
  const items: ScrapedItem[] = [];
  const itemRegex = /<(item|entry)[\s\S]*?<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(html)) !== null && items.length < maxItems * 2) {
    const block = match[0];
    const title = extractXmlTag(block, "title") || extractXmlTag(block, "dc:title") || "";
    const link = extractXmlTag(block, "link") || extractXmlAttr(block, "link", "href") || "";
    const desc = extractXmlTag(block, "description") || extractXmlTag(block, "summary") || extractXmlTag(block, "content") || "";
    const pubDate = extractXmlTag(block, "pubDate") || extractXmlTag(block, "published") || extractXmlTag(block, "dc:date") || "";
    items.push({
      title,
      summary: desc || undefined,
      itemUrl: link ? resolveUrl(baseUrl, link) : undefined,
      publishedDate: pubDate ? parseDate(pubDate) : undefined,
    });
  }

  return dedupeAndFilter(items, baseUrl, maxItems);
}

function extractArticleLinks(html: string, baseUrl: string, maxItems: number): ScrapedItem[] {
  const items: ScrapedItem[] = [];
  const patterns = [
    /<article[\s\S]*?<\/article>/gi,
    /<div[^>]*class=["'][^"']*(?:news|article|story|post|release|press|item|card|teaser|listing|opportunity|solicitation)[^"']*["'][\s\S]*?<\/div>/gi,
    /<li[\s\S]*?<\/li>/gi,
  ];

  for (const pattern of patterns) {
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = pattern.exec(html)) !== null && items.length < maxItems * 3) {
      const block = blockMatch[0];
      const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let linkMatch: RegExpExecArray | null;
      while ((linkMatch = linkRegex.exec(block)) !== null && items.length < maxItems * 3) {
        const href = cleanText(linkMatch[1]);
        const linkText = cleanText(linkMatch[2]);
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
        const resolved = resolveUrl(baseUrl, href);
        const dateMatch =
          /<time[^>]*datetime=["']([^"']*)["']/i.exec(block) ||
          /(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(block) ||
          /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i.exec(block);
        items.push({
          title: linkText,
          summary: extractBlockSummary(block, linkText),
          itemUrl: resolved,
          publishedDate: dateMatch ? parseDate(dateMatch[1]) : undefined,
        });
      }
    }
  }

  if (items.length === 0) {
    const allLinks = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = allLinks.exec(html)) !== null && items.length < maxItems * 3) {
      const href = cleanText(m[1]);
      const text = cleanText(m[2]);
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
      items.push({ title: text, itemUrl: resolveUrl(baseUrl, href) });
    }
  }

  return dedupeAndFilter(items, baseUrl, maxItems);
}

function extractGovernmentListings(html: string, baseUrl: string, maxItems: number): ScrapedItem[] {
  const items: ScrapedItem[] = [];
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null && items.length < maxItems * 3) {
    const row = rowMatch[0];
    const linkMatch = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!linkMatch) continue;
    const href = cleanText(linkMatch[1]);
    const text = cleanText(linkMatch[2]);
    if (!href) continue;
    const dateMatch =
      /<time[^>]*datetime=["']([^"']*)["']/i.exec(row) ||
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(row) ||
      /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i.exec(row);
    items.push({
      title: text,
      summary: extractBlockSummary(row, text),
      itemUrl: resolveUrl(baseUrl, href),
      publishedDate: dateMatch ? parseDate(dateMatch[1]) : undefined,
    });
  }

  if (items.length === 0) return extractArticleLinks(html, baseUrl, maxItems);
  return dedupeAndFilter(items, baseUrl, maxItems);
}

export async function scrapeSource(source: MonitoredSource): Promise<ScrapeResult> {
  const { url, scrapeStrategy, timeoutMs, maxItemsPerRun } = source;

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return { status: "failed", items: [], errorMessage: "Invalid URL scheme" };
  }

  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname.startsWith("192.168.") ||
      parsed.hostname.startsWith("10.")
    ) {
      return { status: "failed", items: [], errorMessage: "Private IP blocked" };
    }
  } catch {
    return { status: "failed", items: [], errorMessage: "Invalid URL" };
  }

  let html: string;
  try {
    const result = await fetchWithTimeout(url, timeoutMs);
    if (!result.ok) {
      if (result.status === 403 || result.status === 429) {
        return { status: "blocked", items: [], errorMessage: `HTTP ${result.status} — site blocked the request` };
      }
      return { status: "failed", items: [], errorMessage: `HTTP ${result.status}` };
    }
    html = result.text;
  } catch (err: any) {
    if (err.name === "AbortError" || err.message?.includes("timeout")) {
      return { status: "timeout", items: [], errorMessage: "Request timed out" };
    }
    return { status: "failed", items: [], errorMessage: err?.message ?? String(err) };
  }

  const lowerHtml = html.toLowerCase();
  if (lowerHtml.includes("cloudflare") && (lowerHtml.includes("challenge") || lowerHtml.includes("checking your browser"))) {
    return { status: "blocked", items: [], errorMessage: "Cloudflare challenge detected" };
  }
  if (lowerHtml.includes("access denied") && lowerHtml.includes("<body")) {
    return { status: "blocked", items: [], errorMessage: "Access denied by target site" };
  }

  let items: ScrapedItem[] = [];
  try {
    switch (scrapeStrategy) {
      case "rss_or_xml":
        items = extractFromRss(html, url, maxItemsPerRun);
        break;
      case "contractor_newsroom":
      case "generic_news_page":
        items = extractArticleLinks(html, url, maxItemsPerRun);
        break;
      case "government_listing":
      case "procurement_portal":
        items = extractGovernmentListings(html, url, maxItemsPerRun);
        break;
      case "fallback_metadata":
      default: {
        const title = extractMeta(html, "og:title") || extractMeta(html, "twitter:title") || "Source checked";
        const summary = extractMeta(html, "og:description") || extractMeta(html, "description");
        items = dedupeAndFilter([{ title, summary, itemUrl: url }], url, maxItemsPerRun);
        break;
      }
    }
  } catch (err: any) {
    return { status: "failed", items: [], errorMessage: `Extraction error: ${err.message}`, rawHtml: html.slice(0, 5000) };
  }

  if (items.length === 0) {
    return { status: "no_items_found", items: [], errorMessage: "No useful intelligence items found after filtering navigation links", rawHtml: html.slice(0, 2000) };
  }

  return { status: "success", items };
}
