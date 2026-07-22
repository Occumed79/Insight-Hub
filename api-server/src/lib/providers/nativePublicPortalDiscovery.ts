import { createHash } from "crypto";

export type NativeDiscoveryMethod =
  | "dedicated_adapter"
  | "robots_sitemap"
  | "conventional_sitemap"
  | "sitemap_url"
  | "rss_feed"
  | "atom_feed"
  | "html_listing"
  | "http_link_pagination"
  | "dynamic_endpoint"
  | "serper_fallback";

export interface NativeDiscoveryCandidate {
  url: string;
  title?: string;
  snippet?: string;
  lastmodHint?: string;
  method: NativeDiscoveryMethod;
  verified: boolean;
  confidence: "high" | "medium" | "low";
  contentType?: string;
}

export interface NativeDiscoveryDiagnostics {
  nativeSourcesAttempted: string[];
  sitemapsFound: string[];
  feedsFound: string[];
  listingPagesCrawled: string[];
  dynamicEndpointsDetected: DynamicEndpointFingerprint[];
  searchFallbackQueriesExecuted: string[];
  portalsDeferred: string[];
  queryBundlesDeferred: number[];
  candidateUrlsByMethod: Record<string, number>;
  candidatesVerifiedFromDirectOfficialContent: number;
  errors: string[];
}

export interface NativeDiscoveryOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  maxUrls?: number;
  maxPages?: number;
  maxBytes?: number;
  maxRedirects?: number;
  maxSitemapDepth?: number;
  elapsedMs?: number;
  allowedHosts?: string[];
}

export interface DynamicEndpointFingerprint {
  pageUrl: string;
  endpointUrl: string;
  method: string;
  queryParameters?: string[];
  bodyShape?: string[];
  responseContentType?: string;
  paginationMechanism: "page" | "offset" | "cursor" | "link" | "unknown";
  candidateIdentifierFields: string[];
  candidateTitleFields: string[];
  candidateStatusFields: string[];
  candidateDateFields: string[];
  candidateDetailLinkFields: string[];
  portalFamily: PortalFamily;
}

export type PortalFamily =
  | "sam.gov"
  | "civicplus"
  | "bonfire"
  | "ionwave"
  | "unknown";

export function classifyPortalFamily(url: string, content = ""): PortalFamily {
  const haystack = `${url} ${content}`.toLowerCase();
  if (haystack.includes("sam.gov")) return "sam.gov";
  if (haystack.includes("civicplus") || haystack.includes("civicengage"))
    return "civicplus";
  if (haystack.includes("gobonfire") || haystack.includes("bonfirehub"))
    return "bonfire";
  if (haystack.includes("ionwave")) return "ionwave";
  return "unknown";
}

export class RobotsRules {
  readonly sitemaps: string[] = [];
  private rules: { allow: boolean; path: string }[] = [];
  static parse(text: string, baseUrl: string): RobotsRules {
    const rules = new RobotsRules();
    let applies = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim();
      if (!line) continue;
      const [, key, value = ""] = line.match(/^([^:]+):\s*(.*)$/) ?? [];
      if (!key) continue;
      const lower = key.toLowerCase();
      if (lower === "user-agent") applies = value.trim() === "*";
      if (lower === "sitemap")
        rules.sitemaps.push(new URL(value.trim(), baseUrl).toString());
      if ((lower === "allow" || lower === "disallow") && applies) {
        rules.rules.push({ allow: lower === "allow", path: value.trim() });
      }
    }
    return rules;
  }
  allows(url: string): boolean {
    const path = new URL(url).pathname;
    let best: { allow: boolean; path: string } | undefined;
    for (const rule of this.rules) {
      if (rule.path === "") continue;
      const prefix = rule.path.replace(/\*.*$/, "");
      if (
        path.startsWith(prefix) &&
        (!best ||
          rule.path.length > best.path.length ||
          (rule.path.length === best.path.length && rule.allow))
      )
        best = rule;
    }
    return best?.allow ?? true;
  }
}

function canonicalizeUrl(
  raw: string,
  base: string,
  allowedHosts: Set<string>,
): string | null {
  try {
    const url = new URL(raw, base);
    url.hash = "";
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (
      ![...allowedHosts].some(
        (allowed) => host === allowed || host.endsWith(`.${allowed}`),
      )
    )
      return null;
    url.hostname = host;
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function parseLinkHeader(
  header: string | null,
  base: string,
): { url: string; rel: string }[] {
  if (!header) return [];
  return header.split(",").flatMap((part) => {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?([^";]+)"?/i);
    return match
      ? [
          {
            url: new URL(match[1], base).toString(),
            rel: match[2].toLowerCase(),
          },
        ]
      : [];
  });
}

function xmlValues(text: string, tag: string): string[] {
  return [
    ...text.matchAll(
      new RegExp(`<[^:>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tag}>`, "gi"),
    ),
  ].map((m) => m[1].trim());
}

export function parseSitemapLike(
  text: string,
  sourceUrl: string,
): {
  sitemaps: string[];
  candidates: NativeDiscoveryCandidate[];
  feeds: string[];
} {
  const sitemaps = xmlValues(text, "sitemap")
    .flatMap((block) => xmlValues(block, "loc"))
    .map((u) => new URL(u, sourceUrl).toString());
  const urlBlocks = xmlValues(text, "url");
  const candidates = urlBlocks.flatMap((block) => {
    const loc = xmlValues(block, "loc")[0];
    if (!loc) return [];
    return [
      {
        url: new URL(loc, sourceUrl).toString(),
        lastmodHint: xmlValues(block, "lastmod")[0],
        method: "sitemap_url" as const,
        verified: false,
        confidence: "low" as const,
      },
    ];
  });
  const rssItems = xmlValues(text, "item").flatMap((block) => {
    const link = xmlValues(block, "link")[0];
    if (!link) return [];
    return [
      {
        url: new URL(link, sourceUrl).toString(),
        title: xmlValues(block, "title")[0],
        method: "rss_feed" as const,
        verified: false,
        confidence: "low" as const,
      },
    ];
  });
  const atomEntries = xmlValues(text, "entry").flatMap((block) => {
    const href = block.match(/<link[^>]+href=["']([^"']+)/i)?.[1];
    if (!href) return [];
    return [
      {
        url: new URL(href, sourceUrl).toString(),
        title: xmlValues(block, "title")[0],
        method: "atom_feed" as const,
        verified: false,
        confidence: "low" as const,
      },
    ];
  });
  const textUrls =
    text.trim().startsWith("http") && !text.includes("<")
      ? text
          .split(/\s+/)
          .filter(Boolean)
          .map((url) => ({
            url: new URL(url, sourceUrl).toString(),
            method: "sitemap_url" as const,
            verified: false,
            confidence: "low" as const,
          }))
      : [];
  return {
    sitemaps,
    candidates: [...candidates, ...rssItems, ...atomEntries, ...textUrls],
    feeds: [...rssItems, ...atomEntries].map((c) => c.url),
  };
}

function parseHtmlLinks(
  html: string,
  pageUrl: string,
): {
  candidates: NativeDiscoveryCandidate[];
  feeds: string[];
  pages: string[];
} {
  const anchors = [
    ...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  ];
  const candidates: NativeDiscoveryCandidate[] = [];
  const pages: string[] = [];
  for (const [, href, labelRaw] of anchors) {
    const label = labelRaw
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const url = new URL(href, pageUrl).toString();
    if (/next|older|more|page\s*\d+/i.test(label + href)) pages.push(url);
    if (
      /rfp|bid|solicitation|opportunit|proposal|quote|\.pdf/i.test(label + href)
    )
      candidates.push({
        url,
        title: label,
        method: "html_listing",
        verified: false,
        confidence: "low",
      });
  }
  const feeds = [
    ...html.matchAll(
      /<link\b[^>]*type=["']application\/(rss\+xml|atom\+xml)["'][^>]*href=["']([^"']+)/gi,
    ),
  ].map((m) => new URL(m[2], pageUrl).toString());
  return { candidates, feeds, pages };
}

export async function discoverNativePortal(
  baseUrl: string,
  options: NativeDiscoveryOptions = {},
): Promise<{
  candidates: NativeDiscoveryCandidate[];
  diagnostics: NativeDiscoveryDiagnostics;
}> {
  const fetcher = options.fetchImpl ?? fetch;
  const started = Date.now();
  const base = new URL(baseUrl);
  const allowed = new Set([
    base.hostname.toLowerCase().replace(/^www\./, ""),
    ...(options.allowedHosts ?? []).map((h) =>
      h.toLowerCase().replace(/^www\./, ""),
    ),
  ]);
  const maxBytes = options.maxBytes ?? 1_000_000;
  const maxPages = options.maxPages ?? 25;
  const maxUrls = options.maxUrls ?? 100;
  const maxDepth = options.maxSitemapDepth ?? 2;
  const diagnostics: NativeDiscoveryDiagnostics = {
    nativeSourcesAttempted: [],
    sitemapsFound: [],
    feedsFound: [],
    listingPagesCrawled: [],
    dynamicEndpointsDetected: [],
    searchFallbackQueriesExecuted: [],
    portalsDeferred: [],
    queryBundlesDeferred: [],
    candidateUrlsByMethod: {},
    candidatesVerifiedFromDirectOfficialContent: 0,
    errors: [],
  };
  const candidates: NativeDiscoveryCandidate[] = [];
  const seenUrls = new Set<string>();
  const seenSignatures = new Set<string>();
  const add = (candidate: NativeDiscoveryCandidate) => {
    const url = canonicalizeUrl(candidate.url, baseUrl, allowed);
    if (!url || seenUrls.has(url) || candidates.length >= maxUrls) return;
    seenUrls.add(url);
    candidate.url = url;
    candidates.push(candidate);
    diagnostics.candidateUrlsByMethod[candidate.method] =
      (diagnostics.candidateUrlsByMethod[candidate.method] ?? 0) + 1;
  };
  let robots = new RobotsRules();
  async function get(url: string) {
    if (options.signal?.aborted)
      throw options.signal.reason ?? new Error("aborted");
    if (Date.now() - started > (options.elapsedMs ?? 10_000))
      throw new Error("native discovery timeout");
    if (!robots.allows(url)) throw new Error(`robots disallow ${url}`);
    const res = await fetcher(url, {
      signal: options.signal,
      redirect: "follow",
    });
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) throw new Error(`oversized response ${url}`);
    const text = await res.text();
    if (text.length > maxBytes) throw new Error(`oversized response ${url}`);
    return { res, text };
  }
  try {
    diagnostics.nativeSourcesAttempted.push("robots.txt");
    const out = await fetcher(new URL("/robots.txt", base).toString(), {
      signal: options.signal,
    });
    robots = RobotsRules.parse(await out.text(), baseUrl);
  } catch (e) {
    diagnostics.errors.push(String(e));
  }
  const sitemapQueue = [
    ...robots.sitemaps,
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap.txt",
  ]
    .map((u) => new URL(u, base).toString())
    .map((u) => ({ url: u, depth: 0 }));
  for (const item of sitemapQueue) {
    if (sitemapQueue.indexOf(item) >= maxPages || item.depth > maxDepth)
      continue;
    const url = canonicalizeUrl(item.url, baseUrl, allowed);
    if (!url) continue;
    try {
      diagnostics.nativeSourcesAttempted.push("sitemap");
      diagnostics.sitemapsFound.push(url);
      const { text } = await get(url);
      const parsed = parseSitemapLike(text, url);
      parsed.candidates.forEach(add);
      parsed.feeds.forEach((f) => diagnostics.feedsFound.push(f));
      parsed.sitemaps.forEach((s) =>
        sitemapQueue.push({ url: s, depth: item.depth + 1 }),
      );
    } catch (e) {
      diagnostics.errors.push(String(e));
    }
  }
  const pageQueue = [baseUrl];
  for (let i = 0; i < pageQueue.length && i < maxPages; i++) {
    const url = canonicalizeUrl(pageQueue[i], baseUrl, allowed);
    if (!url) continue;
    try {
      diagnostics.nativeSourcesAttempted.push("html_listing");
      const { res, text } = await get(url);
      const sig = createHash("sha1")
        .update(text.replace(/\d+/g, "#").slice(0, 5000))
        .digest("hex");
      if (seenSignatures.has(sig)) continue;
      seenSignatures.add(sig);
      diagnostics.listingPagesCrawled.push(url);
      for (const link of parseLinkHeader(res.headers.get("link"), url).filter(
        (l) => ["next", "prev", "first", "last"].includes(l.rel),
      ))
        pageQueue.push(link.url);
      const parsed = parseHtmlLinks(text, url);
      parsed.candidates.forEach(add);
      parsed.feeds.forEach((feed) => {
        diagnostics.feedsFound.push(feed);
        pageQueue.push(feed);
      });
      parsed.pages.forEach((p) => pageQueue.push(p));
    } catch (e) {
      diagnostics.errors.push(String(e));
    }
  }
  for (const c of candidates) {
    try {
      const { res, text } = await get(c.url);
      c.verified = true;
      c.confidence = "medium";
      c.contentType = res.headers.get("content-type") ?? undefined;
      c.snippet ??= text
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 500);
      diagnostics.candidatesVerifiedFromDirectOfficialContent += 1;
    } catch (e) {
      diagnostics.errors.push(String(e));
    }
  }
  return { candidates, diagnostics };
}

export function fingerprintJsonEndpoint(
  pageUrl: string,
  endpointUrl: string,
  method: string,
  responseContentType: string,
  sample: unknown,
  body?: unknown,
): DynamicEndpointFingerprint {
  const keys = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.slice(0, 3).forEach(walk);
    else if (v && typeof v === "object")
      for (const [k, child] of Object.entries(v)) {
        keys.add(k);
        walk(child);
      }
  };
  walk(sample);
  const all = [...keys];
  const pick = (re: RegExp) => all.filter((k) => re.test(k));
  const endpoint = new URL(endpointUrl, pageUrl);
  return {
    pageUrl,
    endpointUrl: endpoint.toString(),
    method,
    queryParameters: [...endpoint.searchParams.keys()],
    bodyShape:
      body && typeof body === "object"
        ? Object.keys(body as Record<string, unknown>)
        : undefined,
    responseContentType,
    paginationMechanism: pick(/cursor|next/i).length
      ? "cursor"
      : pick(/offset|skip/i).length
        ? "offset"
        : pick(/^page|pageNumber/i).length
          ? "page"
          : "unknown",
    candidateIdentifierFields: pick(/id|number|solicitation/i),
    candidateTitleFields: pick(/title|name|subject/i),
    candidateStatusFields: pick(/status|state/i),
    candidateDateFields: pick(/date|deadline|due|close/i),
    candidateDetailLinkFields: pick(/url|link|href/i),
    portalFamily: classifyPortalFamily(
      pageUrl + " " + endpointUrl,
      JSON.stringify(sample).slice(0, 5000),
    ),
  };
}
