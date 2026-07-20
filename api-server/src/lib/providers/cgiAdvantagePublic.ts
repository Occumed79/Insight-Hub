import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import {
  describeOfficialPortalRequestError,
  positiveIntegerEnv,
} from "./officialPortalHttp";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";

type JsonRecord = Record<string, unknown>;

export interface CgiAdvantagePublicTenant {
  portalId: string;
  buyerName: string;
  state: string;
  listingUrl: string;
  sourceBadge: string;
}

interface CgiAdvantageNavigation extends JsonRecord {
  applicationUrl?: string;
  key?: string;
  name?: string;
  title?: string;
  targetComponentType?: string;
  targetLocation?: string;
  targetQualifiedName?: string;
  targetPage?: string;
  viewName?: string;
  isCarouselNavigation?: boolean;
  suppressLeafing?: boolean;
  isEntpriseSrchCreateAction?: boolean;
}

export interface CgiAdvantageSolicitationRow extends JsonRecord {
  ADV_ROW_ID?: string;
  DOC_CD?: string;
  DOC_DSCR?: string;
  DEPT_NM?: string;
  BUYR_NM?: string;
  BUYR_EMAIL_AD?: string;
  BUYR_PH_NO?: string;
  DOC_REF?: string;
  DOC_CD_CONCAT?: string;
  SO_CLSNG_DT_TM?: number | string;
  PUB_DT?: number | string;
  SO_STA?: string;
}

interface CgiAdvantageSession {
  state: JsonRecord;
  cookie: string;
  referer: string;
}

const CLOSED_STATUS = /^(?:C|CL|CLOSED|A|AWARDED|X|CANCELLED|CANCELED)$/i;

export const KENTUCKY_CGI_ADVANTAGE_TENANT: CgiAdvantagePublicTenant = {
  portalId: "ky-vss",
  buyerName: "Commonwealth of Kentucky",
  state: "KY",
  listingUrl: "https://vss.ky.gov/vssprod-ext/Advantage4",
  sourceBadge: "Kentucky eMARS VSS Published Solicitations",
};

export const MICHIGAN_CGI_ADVANTAGE_TENANT: CgiAdvantagePublicTenant = {
  portalId: "mi-sigma",
  buyerName: "State of Michigan",
  state: "MI",
  listingUrl: "https://sigma.michigan.gov/PRDVSS1X1/Advantage4",
  sourceBadge: "Michigan SIGMA VSS Published Solicitations",
};

function sourceFor(tenant: CgiAdvantagePublicTenant): PublicPortalSource {
  return {
    id: tenant.portalId,
    agencyName: tenant.buyerName,
    agencyType: "state",
    state: tenant.state,
    sourceUrl: tenant.listingUrl,
    searchUrl: tenant.listingUrl,
    domain: new URL(tenant.listingUrl).hostname,
    portalPlatform: "CGI Advantage Vendor Self Service",
    sourceLevel: "state",
    level: "state",
    accessMode: "api",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: "Dedicated adapter for the ordinary public CGI Advantage guest-session solicitation flow.",
  };
}

export const KENTUCKY_CGI_ADVANTAGE_SOURCE = sourceFor(KENTUCKY_CGI_ADVANTAGE_TENANT);
export const MICHIGAN_CGI_ADVANTAGE_SOURCE = sourceFor(MICHIGAN_CGI_ADVANTAGE_TENANT);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function extractCgiAdvantageInitialState(html: string): JsonRecord {
  const marker = html.indexOf("moInitialResponse");
  if (marker < 0) throw new Error("CGI Advantage page did not expose moInitialResponse");
  const start = html.indexOf("{", marker);
  if (start < 0) throw new Error("CGI Advantage initial response JSON did not start");

  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const value = html[index] as string;
    if (quote) {
      if (escaped) escaped = false;
      else if (value === "\\") escaped = true;
      else if (value === quote) quote = "";
      continue;
    }
    if (value === '"' || value === "'") quote = value;
    else if (value === "{") depth += 1;
    else if (value === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1)) as JsonRecord;
    }
  }
  throw new Error("CGI Advantage initial response JSON was incomplete");
}

function findNavigation(value: unknown, matcher: RegExp): CgiAdvantageNavigation | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNavigation(item, matcher);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (
    value.type === "nav"
    && matcher.test(`${String(value.title ?? "")} ${String(value.name ?? "")} ${String(value.key ?? "")}`)
  ) return value as CgiAdvantageNavigation;
  for (const item of Object.values(value)) {
    const found = findNavigation(item, matcher);
    if (found) return found;
  }
  return undefined;
}

function cookieHeader(headers: Headers, prior = ""): string {
  const cookies = new Map<string, string>();
  for (const pair of prior.split(/;\s*/).filter(Boolean)) {
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const values = extended.getSetCookie?.()
    ?? (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
  for (const value of values) {
    const pair = value.split(";", 1)[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return Array.from(cookies.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

function sameOfficialOrigin(tenant: CgiAdvantagePublicTenant, value: string): string {
  const expectedOrigin = new URL(tenant.listingUrl).origin;
  const url = new URL(value, tenant.listingUrl);
  if (url.origin !== expectedOrigin) {
    throw new Error(`${tenant.portalId} rejected a CGI Advantage action outside its official origin`);
  }
  return url.toString();
}

function actionPayload(state: JsonRecord, navigation: CgiAdvantageNavigation): JsonRecord {
  const sessionInfo = isRecord(state.session_info) ? state.session_info : {};
  return {
    action: {
      key: navigation.key,
      name: navigation.name,
      actionType: "pageOpen",
      params: {
        targetLocation: navigation.targetLocation,
        targetComponentType: navigation.targetComponentType,
        isEntpriseSrchCreateAction: Boolean(navigation.isEntpriseSrchCreateAction),
      },
      targetQualifiedName: navigation.targetQualifiedName,
      ...(navigation.targetPage ? { targetPage: navigation.targetPage } : {}),
      ...(navigation.viewName ? { viewName: navigation.viewName } : {}),
      isCarouselNavigation: Boolean(navigation.isCarouselNavigation),
      suppressLeafing: Boolean(navigation.suppressLeafing),
    },
    session_info: sessionInfo,
    ...(state.data ? { data: state.data } : {}),
    ...(state.viewState ? { viewState: state.viewState } : {}),
    ...(state.checksum ? { checksum: state.checksum } : {}),
  };
}

async function requestWithRetries(
  label: string,
  timeoutMs: number,
  maxRetries: number,
  request: (signal: AbortSignal) => Promise<Response>,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await request(controller.signal);
      if (response.ok) return response;
      const body = await response.text().catch(() => "");
      lastError = new Error(`${label} returned HTTP ${response.status}${body ? `: ${body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 180)}` : ""}`);
      if ((response.status < 500 && response.status !== 408 && response.status !== 429) || attempt >= maxRetries) break;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(400 * 2 ** attempt, 5_000)));
  }
  throw new Error(describeOfficialPortalRequestError(lastError, label, timeoutMs));
}

async function openGuestSession(
  tenant: CgiAdvantagePublicTenant,
  timeoutMs: number,
  maxRetries: number,
): Promise<CgiAdvantageSession> {
  const response = await requestWithRetries(
    `${tenant.portalId} CGI Advantage guest page`,
    timeoutMs,
    maxRetries,
    (signal) => fetch(tenant.listingUrl, {
      signal,
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
      },
    }),
  );
  const finalUrl = sameOfficialOrigin(tenant, response.url || tenant.listingUrl);
  const html = await response.text();
  return {
    state: extractCgiAdvantageInitialState(html),
    cookie: cookieHeader(response.headers),
    referer: finalUrl,
  };
}

async function postPageOpen(
  tenant: CgiAdvantagePublicTenant,
  session: CgiAdvantageSession,
  navigation: CgiAdvantageNavigation,
  timeoutMs: number,
  maxRetries: number,
): Promise<CgiAdvantageSession> {
  const applicationUrl = sameOfficialOrigin(tenant, String(navigation.applicationUrl ?? tenant.listingUrl));
  const sessionInfo = isRecord(session.state.session_info) ? session.state.session_info : {};
  const response = await requestWithRetries(
    `${tenant.portalId} CGI Advantage ${String(navigation.title ?? navigation.name ?? "page")}`,
    timeoutMs,
    maxRetries,
    (signal) => fetch(applicationUrl, {
      method: "POST",
      signal,
      redirect: "manual",
      headers: {
        accept: "application/json,text/plain,*/*",
        "content-type": "application/json",
        origin: new URL(applicationUrl).origin,
        referer: session.referer,
        ...(session.cookie ? { cookie: session.cookie } : {}),
        "adv-page-id": String(sessionInfo.page_id ?? ""),
        "adv-action-type": "pageOpen",
        "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
      },
      body: JSON.stringify(actionPayload(session.state, navigation)),
    }),
  );
  const body = await response.text();
  let state: JsonRecord;
  try {
    state = JSON.parse(body) as JsonRecord;
  } catch (error) {
    throw new Error(`${tenant.portalId} CGI Advantage returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    state,
    cookie: cookieHeader(response.headers, session.cookie),
    referer: applicationUrl,
  };
}

function findSolicitationRows(value: unknown): CgiAdvantageSolicitationRow[] {
  if (Array.isArray(value)) {
    if (value.some((row) => isRecord(row) && (row.DOC_REF || row.DOC_DSCR))) {
      return value.filter(isRecord) as CgiAdvantageSolicitationRow[];
    }
    for (const item of value) {
      const found = findSolicitationRows(item);
      if (found.length) return found;
    }
    return [];
  }
  if (!isRecord(value)) return [];
  if (Array.isArray(value.row_data)) {
    const rows = findSolicitationRows(value.row_data);
    if (rows.length) return rows;
  }
  for (const item of Object.values(value)) {
    const found = findSolicitationRows(item);
    if (found.length) return found;
  }
  return [];
}

export function parseCgiAdvantageSolicitationRows(payload: unknown): CgiAdvantageSolicitationRow[] {
  return findSolicitationRows(payload).filter((row) => Boolean(row.DOC_REF && row.DOC_DSCR));
}

function epochDate(value: unknown): Date | undefined {
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  const parsed = new Date(numeric);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function solicitationNumber(row: CgiAdvantageSolicitationRow): string {
  const reference = String(row.DOC_REF ?? "").trim();
  const display = reference.match(/\]\[([^\]]+)\]$/)?.[1]?.trim();
  if (display) return display;
  const components = reference.match(/^\[([^\]]+)\]/)?.[1]?.split(",").map((value) => value.trim());
  if (components?.length) return components.join("-");
  return String(row.ADV_ROW_ID ?? reference);
}

function typeFromRow(row: CgiAdvantageSolicitationRow): string {
  return String(row.DOC_CD_CONCAT || row.DOC_CD || "Solicitation").trim();
}

function matchesOptions(record: NormalizedOpportunity, options: FetchOptions): boolean {
  const terms = options.keywords?.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms?.length) {
    const haystack = [record.title, record.agency, record.description, record.solicitationNumber]
      .filter(Boolean).join(" ").toLowerCase();
    if (!terms.some((term) => haystack.includes(term))) return false;
  }
  if (options.dateRange && record.postedDate.getTime() > 0) {
    const cutoff = Date.now() - options.dateRange * 86_400_000;
    if (record.postedDate.getTime() < cutoff) return false;
  }
  return true;
}

function toOpportunity(
  tenant: CgiAdvantagePublicTenant,
  row: CgiAdvantageSolicitationRow,
): NormalizedOpportunity | undefined {
  const nativeId = solicitationNumber(row);
  const title = String(row.DOC_DSCR ?? "").trim();
  if (!nativeId || !title) return undefined;
  const responseDeadline = epochDate(row.SO_CLSNG_DT_TM);
  if (responseDeadline && responseDeadline.getTime() < Date.now()) return undefined;
  if (CLOSED_STATUS.test(String(row.SO_STA ?? ""))) return undefined;
  const postedDate = epochDate(row.PUB_DT);
  const buyer = String(row.BUYR_NM ?? "").trim() || undefined;
  const buyerEmail = String(row.BUYR_EMAIL_AD ?? "").trim() || undefined;
  const buyerPhone = String(row.BUYR_PH_NO ?? "").trim() || undefined;
  const agency = String(row.DEPT_NM ?? "").trim() || tenant.buyerName;

  return {
    externalId: `${tenant.portalId}-${nativeId.replace(/[^a-z0-9._-]/gi, "-")}`,
    title,
    agency,
    type: typeFromRow(row),
    status: "active",
    postedDate: postedDate ?? new Date(0),
    responseDeadline,
    placeOfPerformance: tenant.state,
    description: [
      buyer ? `Buyer: ${buyer}` : undefined,
      buyerEmail ? `Buyer email: ${buyerEmail}` : undefined,
      buyerPhone ? `Buyer phone: ${buyerPhone}` : undefined,
    ].filter(Boolean).join("\n") || undefined,
    solicitationNumber: nativeId,
    sourceUrl: tenant.listingUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "cgi_advantage_vss",
      providerPlatform: "cgi_advantage_public_guest",
      providerType: "statewide_public_guest_session",
      connectorName: `${tenant.buyerName} CGI Advantage public solicitation adapter`,
      discoveryMethod: "official_public_guest_page_action",
      sourceBadge: tenant.sourceBadge,
      sourceConfidence: "high",
      sourceId: tenant.portalId,
      nativeOpportunityId: nativeId,
      listingUrl: tenant.listingUrl,
      documentReference: row.DOC_REF,
      documentCode: row.DOC_CD,
      upstreamStatus: row.SO_STA,
      buyer,
      buyerEmail,
      buyerPhone,
      dateUnknown: !postedDate,
      deadlineUnknown: !responseDeadline,
      collectedAt: new Date().toISOString(),
      tags: [
        "direct-official-portal",
        "official-public-guest-session",
        "platform:cgi-advantage-vss",
        `state:${tenant.state}`,
        ...(!postedDate ? ["date-unknown"] : []),
      ],
    },
  };
}

export class CgiAdvantagePublicProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  constructor(readonly tenant: CgiAdvantagePublicTenant) {}

  async isConfigured(): Promise<boolean> {
    return Boolean(this.tenant.portalId && this.tenant.state && new URL(this.tenant.listingUrl).protocol === "https:");
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const timeoutMs = positiveIntegerEnv("CGI_ADVANTAGE_REQUEST_TIMEOUT_MS", 30_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("CGI_ADVANTAGE_MAX_RETRIES", 1, 0, 2);
    const maxResults = positiveIntegerEnv("CGI_ADVANTAGE_MAX_RESULTS", 100, 1, 500);
    const offset = Math.max(options.offset ?? 0, 0);
    const limit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);

    try {
      const initial = await openGuestSession(this.tenant, timeoutMs, maxRetries);
      const carousel = findNavigation(initial.state, /carousalAction|what would you like to do/i);
      if (!carousel) throw new Error(`${this.tenant.portalId} public guest carousel action was not present`);
      const carouselPage = await postPageOpen(this.tenant, initial, carousel, timeoutMs, maxRetries);
      const solicitations = findNavigation(carouselPage.state, /view published solicitations|solicitations/i);
      if (!solicitations) throw new Error(`${this.tenant.portalId} published-solicitations action was not present`);
      const solicitationPage = await postPageOpen(this.tenant, carouselPage, solicitations, timeoutMs, maxRetries);
      const upstream = parseCgiAdvantageSolicitationRows(solicitationPage.state);
      const records = upstream
        .map((row) => toOpportunity(this.tenant, row))
        .filter((record): record is NormalizedOpportunity => Boolean(record))
        .filter((record) => matchesOptions(record, options))
        .slice(offset, offset + limit);

      if (!records.length && upstream.length) {
        throw new Error(`${this.tenant.portalId} published-solicitations page returned rows but none normalized as active`);
      }
      this.recordCount = records.length;
      this.lastError = undefined;
      this.lastSuccess = new Date();
      return { records, total: records.length, errors: [] };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.recordCount = 0;
      this.lastError = reason;
      return { records: [], total: 0, errors: [`${this.tenant.portalId}: ${reason}`] };
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: await this.isConfigured(),
      healthy: !this.lastError,
      errorMessage: this.lastError,
      lastAttempt: this.lastAttempt,
      lastSuccess: this.lastSuccess,
      recordCount: this.recordCount,
    };
  }
}

export const kentuckyCgiAdvantageProvider = new CgiAdvantagePublicProvider(
  KENTUCKY_CGI_ADVANTAGE_TENANT,
);
export const michiganCgiAdvantageProvider = new CgiAdvantagePublicProvider(
  MICHIGAN_CGI_ADVANTAGE_TENANT,
);
