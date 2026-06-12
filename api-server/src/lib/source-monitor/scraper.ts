/**
 * Source Monitor Scraper Engine
 *
 * Lightweight fetch-based scraper for the curated source registry.
 * No external scraping libraries — uses plain fetch + regex/string extraction.
 *
 * Strategy per source:
 * 1. rss_or_xml — Parse RSS/Atom feeds with regex.
 * 2. contractor_newsroom / generic_news_page — Extract article cards from HTML.
 * 3. government_listing — Extract listing links from HTML.
 * 4. procurement_portal — Extract opportunity/contract links from HTML.
 * 5. fallback_metadata — Return only source metadata (no items found).
 */

import { createHash } from "crypto";
import type { MonitoredSource, ScrapeStrategy } from "./registry";

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

function makeId(sourceId: string, title: string, url?: string): string {
  const hash = createHash("sha256")
    .update(`${sourceId}::${title}::${url ?? ""}`)
    .digest("hex");
  return `smi-${hash.slice(0, 16)}`;
}

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
  return {
    ok: res.ok,
    status: res.status,
    text,
    headers: res.headers,
  };
}

// ── RSS / XML extraction ─────────────────────────────────────────────────────

function extractFromRss(html: string, baseUrl: string, maxItems: number): ScrapedItem[] {
  const items: ScrapedItem[] = [];
  // Match RSS <item> or Atom <entry> blocks
  const itemRegex = /<(item|entry)[\s\S]*?<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(html)) !== null && items.length < maxItems) {
    const block = match[0];
    const title =
      extractXmlTag(block, "title") ||
      extractXmlTag(block, "dc:title") ||
      "";
    const link =
      extractXmlTag(block, "link") ||
      extractXmlAttr(block, "link", "href") ||
      "";
    const desc =
      extractXmlTag(block, "description") ||
      extractXmlTag(block, "summary") ||
      extractXmlTag(block, "content") ||
      "";
    const pubDate =
      extractXmlTag(block, "pubDate") ||
      extractXmlTag(block, "published") ||
      extractXmlTag(block, "dc:date") ||
      "";
    const date = parseDate(pubDate);
    items.push({
      title: cleanText(title) || "Untitled",
      summary: cleanText(desc) || undefined,
      itemUrl: link ? resolveUrl(baseUrl, cleanText(link)) : undefined,
      publishedDate: date,
    });
  }
  return items;
}

function extractXmlTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = regex.exec(xml);
  if (!m) return undefined;
  return m[1].replace(/<\/?[^>]+>/g, "").trim();
}

function extractXmlAttr(xml: string, tag: string, attr: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "i");
  const m = regex.exec(xml);
  return m ? m[1] : undefined;
}

// ── HTML extraction helpers ──────────────────────────────────────────────────

function cleanText(raw: string): string {
  return raw
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

function extractMeta(html: string, name: string): string | undefined {
  const regex = new RegExp(
    `<meta\\s+(?:name|property)=["']${name}["']\\s+content=["']([^"']*)["']`,
    "i"
  );
  const m = regex.exec(html);
  return m ? cleanText(m[1]) : undefined;
}

function extractOgTitle(html: string): string | undefined {
  return extractMeta(html, "og:title");
}

function extractOgDescription(html: string): string | undefined {
  return extractMeta(html, "og:description");
}

function extractTitleTag(html: string): string | undefined {
  const m = /<title>([^<]*)<\/title>/i.exec(html);
  return m ? cleanText(m[1]) : undefined;
}

function extractArticleLinks(
  html: string,
  baseUrl: string,
  maxItems: number
): ScrapedItem[] {
  const items: ScrapedItem[] = [];
  const seen = new Set<string>();

  // Strategy: find article/card blocks then extract title + link from each
  // Try common news/card patterns
  const patterns = [
    // News article blocks (div > a + heading)
    /<article[\s\S]*?<\/article>/gi,
    /<div[^>]*class=["'][^"']*(?:news|article|story|post|item|card|teaser|listing)[^"']*["'][\s\S]*?<\/div>/gi,
    // Generic list items
    /<li[\s\S]*?<\/li>/gi,
  ];

  for (const pattern of patterns) {
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = pattern.exec(html)) !== null && items.length < maxItems) {
      const block = blockMatch[0];

      // Extract the primary link from this block
      const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let linkMatch: RegExpExecArray | null;
      while ((linkMatch = linkRegex.exec(block)) !== null && items.length < maxItems) {
        const href = cleanText(linkMatch[1]);
        const linkText = cleanText(linkMatch[2]);
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;

        const resolved = resolveUrl(baseUrl, href);
        if (!isSameDomain(baseUrl, resolved)) continue;

        // Skip nav/footer/social links
        const lowerHref = href.toLowerCase();
        const lowerText = linkText.toLowerCase();
        if (
          lowerHref.includes("/privacy") ||
          lowerHref.includes("/terms") ||
          lowerHref.includes("/contact") ||
          lowerHref.includes("/about") ||
          lowerHref.includes("/careers") ||
          lowerHref.includes("/login") ||
          lowerHref.includes("facebook.com") ||
          lowerHref.includes("twitter.com") ||
          lowerHref.includes("linkedin.com") ||
          lowerHref.includes("youtube.com") ||
          lowerText.length < 5
        ) {
          continue;
        }

        const key = resolved + "::" + linkText;
        if (seen.has(key)) continue;
        seen.add(key);

        // Try to find a date in the block
        const dateMatch =
          /<time[^>]*datetime=["']([^"']*)["']/i.exec(block) ||
          /(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(block) ||
          /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i.exec(block);
        const date = dateMatch ? parseDate(dateMatch[1]) : undefined;

        items.push({
          title: linkText || "Untitled",
          summary: undefined,
          itemUrl: resolved,
          publishedDate: date,
        });
      }
    }
  }

  // Fallback: extract all <a> tags with meaningful text and dedupe
  if (items.length === 0) {
    const allLinks = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = allLinks.exec(html)) !== null && items.length < maxItems) {
      const href = cleanText(m[1]);
      const text = cleanText(m[2]);
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
      const resolved = resolveUrl(baseUrl, href);
      if (!isSameDomain(baseUrl, resolved)) continue;
      if (text.length < 10) continue;
      const key = resolved + "::" + text;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        title: text,
        itemUrl: resolved,
      });
    }
  }

  return items;
}

function extractGovernmentListings(
  html: string,
  baseUrl: string,
  maxItems: number
): ScrapedItem[] {
  // Government pages often have table rows or simple link lists
  const items: ScrapedItem[] = [];
  const seen = new Set<string>();

  // Try table rows first
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null && items.length < maxItems) {
    const row = rowMatch[0];
    const linkMatch = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!linkMatch) continue;
    const href = cleanText(linkMatch[1]);
    const text = cleanText(linkMatch[2]);
    if (!href || text.length < 5) continue;
    const resolved = resolveUrl(baseUrl, href);
    if (!isSameDomain(baseUrl, resolved)) continue;
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    // Try to find a date in the row
    const dateMatch =
      /<time[^>]*datetime=["']([^"']*)["']/i.exec(row) ||
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(row) ||
      /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i.exec(row);
    const date = dateMatch ? parseDate(dateMatch[1]) : undefined;

    items.push({
      title: text,
      itemUrl: resolved,
      publishedDate: date,
    });
  }

  // Fallback to all links if no table rows worked
  if (items.length === 0) {
    return extractArticleLinks(html, baseUrl, maxItems);
  }
  return items;
}

// ── Main scrape function ─────────────────────────────────────────────────────

export async function scrapeSource(source: MonitoredSource): Promise<ScrapeResult> {
  const { url, scrapeStrategy, timeoutMs, maxItemsPerRun } = source;

  // Security check
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return { status: "failed", items: [], errorMessage: "Invalid URL scheme" };
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname.startsWith("192.168.") || parsed.hostname.startsWith("10.")) {
      return { status: "failed", items: [], errorMessage: "Private IP blocked" };
    }
  } catch {
    return { status: "failed", items: [], errorMessage: "Invalid URL" };
  }

  // Fetch
  let html: string;
  let responseStatus: number;
  try {
    const result = await fetchWithTimeout(url, timeoutMs);
    responseStatus = result.status;
    if (!result.ok) {
      if (result.status === 403 || result.status === 429) {
        return {
          status: "blocked",
          items: [],
          errorMessage: `HTTP ${result.status} — site blocked the request`,
        };
      }
      return {
        status: "failed",
        items: [],
        errorMessage: `HTTP ${result.status}`,
      };
    }
    html = result.text;
  } catch (err: any) {
    if (err.name === "AbortError" || err.message?.includes("timeout")) {
      return { status: "timeout", items: [], errorMessage: "Request timed out" };
    }
    return { status: "failed", items: [], errorMessage: err?.message ?? String(err) };
  }

  // Check for common anti-bot / block indicators
  const lowerHtml = html.toLowerCase();
  if (
    lowerHtml.includes("cloudflare") &&
    (lowerHtml.includes("challenge") || lowerHtml.includes("checking your browser"))
  ) {
    return { status: "blocked", items: [], errorMessage: "Cloudflare challenge detected" };
  }
  if (lowerHtml.includes("access denied") && lowerHtml.includes("<body")) {
    return { status: "blocked", items: [], errorMessage: "Access denied by target site" };
  }

  // Strategy dispatch
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
        items = extractGovernmentListings(html, url, maxItemsPerRun);
        break;
      case "procurement_portal":
        items = extractGovernmentListings(html, url, maxItemsPerRun);
        break;
      case "fallback_metadata":
      default:
        // No extraction, just metadata
        break;
    }
  } catch (err: any) {
    return {
      status: "failed",
      items: [],
      errorMessage: `Extraction error: ${err.message}`,
      rawHtml: html.slice(0, 5000),
    };
  }

  if (items.length === 0) {
    return {
      status: "no_items_found",
      items: [],
      errorMessage: "No extractable items found on this page",
      rawHtml: html.slice(0, 2000),
    };
  }

  return { status: "success", items };
}
