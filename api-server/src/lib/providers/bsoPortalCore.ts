import type { PublicPortalSource } from "./publicPortalProviders/catalog";
export const UNKNOWN_DATE = new Date(0);
export const OCCUMED_TERMS = [
  "occupational health", "occupational medicine", "medical services", "medical examination",
  "physical examination", "fitness for duty", "drug testing", "drug screening",
  "alcohol testing", "employee health", "medical surveillance", "respirator fit",
  "spirometry", "pulmonary function", "audiometric", "hearing conservation",
  "laboratory testing", "vaccination", "immunization",
];

export interface BsoTenant {
  id: "ma-commbuys" | "nv-epro" | "nj-start";
  name: string;
  agency: string;
  state: "MA" | "NV" | "NJ";
  domain: string;
  origin: string;
  listingUrl: string;
}

export const BSO_TENANTS: readonly BsoTenant[] = [
  { id: "ma-commbuys", name: "Massachusetts COMMBUYS", agency: "Commonwealth of Massachusetts", state: "MA", domain: "commbuys.com", origin: "https://www.commbuys.com", listingUrl: "https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true" },
  { id: "nv-epro", name: "NEVADAePro", agency: "State of Nevada", state: "NV", domain: "nevadaepro.com", origin: "https://nevadaepro.com", listingUrl: "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true" },
  { id: "nj-start", name: "NJSTART", agency: "State of New Jersey", state: "NJ", domain: "njstart.gov", origin: "https://www.njstart.gov", listingUrl: "https://www.njstart.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true" },
] as const;

export const BSO_PUBLIC_PORTAL_SOURCES: PublicPortalSource[] = BSO_TENANTS.map((tenant) => ({
  id: tenant.id,
  agencyName: tenant.name,
  agencyType: "state",
  state: tenant.state,
  sourceUrl: tenant.listingUrl,
  searchUrl: tenant.listingUrl,
  domain: tenant.domain,
  portalPlatform: "Periscope S2G / BSO",
  sourceLevel: "state",
  level: "state",
  accessMode: "portal",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: "Dedicated public listing/detail adapter for the Periscope S2G / BSO platform family.",
}));

export type ListingRow = {
  docId: string;
  title: string;
  agency?: string;
  buyer?: string;
  alternateId?: string;
  responseDeadline?: Date;
  sourceUrl: string;
  listingPageUrl: string;
  page: number;
};

export type Detail = {
  title?: string;
  agency?: string;
  buyer?: string;
  alternateId?: string;
  bidType?: string;
  bulletin?: string;
  contact?: string;
  postedDate?: Date;
  responseDeadline?: Date;
  attachments: Array<{ name: string; url: string }>;
  nigpCodes: string[];
};

export function envInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function decode(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function text(html: string): string {
  return decode(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function attr(attributes: string, name: string): string | undefined {
  return decode(attributes.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))?.[2] ?? "") || undefined;
}

export function safeUrl(value: string, base: string, origin: string): string | undefined {
  try {
    const url = new URL(decode(value), base);
    if (url.origin !== origin) return undefined;
    url.hash = "";
    return url.toString();
  } catch { return undefined; }
}

export function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.replace(/\s+/g, " ").trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function dateValue(value: string): string | undefined {
  return value.match(/\b\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?/i)?.[0];
}

export function labelValue(source: string, label: string, next: string[]): string | undefined {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escape(label)}\\s*:?\\s*([\\s\\S]*?)(?=\\s+(?:${next.map(escape).join("|")})\\s*:|$)`, "i"));
  return match?.[1]?.replace(/\s+/g, " ").trim() || undefined;
}

export class Session {
  private readonly cookies = new Map<string, string>();
  constructor(private readonly origin: string, private readonly timeoutMs: number, private readonly retries: number) {}

  get(url: string, label: string): Promise<string> { return this.request(url, label, "GET"); }
  post(url: string, body: URLSearchParams, label: string): Promise<string> { return this.request(url, label, "POST", body); }

  private async request(value: string, label: string, method: "GET" | "POST", body?: URLSearchParams): Promise<string> {
    const url = safeUrl(value, value, this.origin);
    if (!url) throw new Error(`${label} rejected a cross-origin URL`);
    let last: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const cookie = Array.from(this.cookies.entries()).map(([key, val]) => `${key}=${val}`).join("; ");
        const response = await fetch(url, {
          method,
          body: method === "POST" ? body?.toString() : undefined,
          signal: controller.signal,
          redirect: "follow",
          headers: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
            ...(cookie ? { cookie } : {}),
            "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
          },
        });
        const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [response.headers.get("set-cookie")].filter((value): value is string => Boolean(value));
        for (const header of setCookies) {
          const pair = header.split(";", 1)[0];
          const separator = pair.indexOf("=");
          if (separator > 0) this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
        }
        if (response.url && new URL(response.url).origin !== this.origin) throw new Error(`${label} redirected outside its official origin`);
        if (response.ok) return response.text();
        const retryable = response.status === 429 || response.status >= 500;
        const message = `${label} returned HTTP ${response.status}`;
        if (!retryable || attempt >= this.retries) throw new Error(message);
        const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
        await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : 400 * 2 ** attempt);
        last = new Error(message);
      } catch (error) {
        last = error;
        if (attempt >= this.retries) break;
        await sleep(400 * 2 ** attempt);
      } finally { clearTimeout(timer); }
    }
    if (last instanceof Error && last.name === "AbortError") throw new Error(`${label} timed out after ${this.timeoutMs}ms`);
    throw last instanceof Error ? last : new Error(`${label} request failed`);
  }
}


function sleep(milliseconds: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
