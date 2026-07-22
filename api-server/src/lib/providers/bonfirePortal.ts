import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { fetchOfficialPortalText, positiveIntegerEnv } from "./officialPortalHttp";

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_RESULTS_PER_TENANT = 50;
const UNKNOWN_POSTED_DATE = new Date(0);

export interface BonfireTenant {
  portalId: string;
  tenantSlug: string;
  buyerName: string;
  state: string;
  listingUrl: string;
  origin: string;
}

export const BONFIRE_TENANTS: BonfireTenant[] = [
  {
    portalId: "tn-montgomery-county",
    tenantSlug: "mcgtn",
    buyerName: "Montgomery County",
    state: "TN",
    listingUrl: "https://mcgtn.bonfirehub.com/opportunities",
    origin: "https://mcgtn.bonfirehub.com",
  },
];

export const BONFIRE_COLLECTIBLE_PORTAL_IDS = new Set(
  BONFIRE_TENANTS.map((tenant) => tenant.portalId),
);

const TENANT_BY_PORTAL_ID = new Map(
  BONFIRE_TENANTS.map((tenant) => [tenant.portalId, tenant]),
);

// The public endpoint that returns open opportunities as JSON (no auth required).
function publicOpportunitiesUrl(tenant: BonfireTenant): string {
  return `${tenant.origin}/PublicPortal/getOpenPublicOpportunitiesSectionData`;
}

function opportunityDetailUrl(tenant: BonfireTenant, projectId: string): string {
  return `${tenant.origin}/opportunities/${projectId}`;
}

interface BonfireApiResponse {
  success: number;
  payload?: {
    projects?: Record<string, BonfireApiProject>;
  };
}

interface BonfireApiProject {
  ProjectID: string;
  PrivateProjectID?: string;
  ReferenceID?: string;
  ProjectName?: string;
  DateClose?: string;
  DateOpen?: string;
  DepartmentID?: string;
  ProjectStatusID?: string;
  description?: string;
}

function parseApiDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeType(name: string | undefined): string {
  const lower = name?.toLowerCase() ?? "";
  if (lower.includes("rfp")) return "RFP";
  if (lower.includes("rfq")) return "RFQ";
  if (lower.includes("rfi")) return "RFI";
  if (lower.includes("bid") || lower.includes("itb") || lower.includes("ifb")) return "Bid";
  return "Solicitation";
}

function stableBonfireId(tenant: BonfireTenant, project: BonfireApiProject): string {
  const nativeId = project.ProjectID;
  return `bonfire-${tenant.tenantSlug}-${nativeId}`;
}

function projectToOpportunity(
  project: BonfireApiProject,
  tenant: BonfireTenant,
  listingUrl: string,
): NormalizedOpportunity {
  const responseDeadline = parseApiDate(project.DateClose);
  const postedDate = parseApiDate(project.DateOpen);
  const detailUrl = opportunityDetailUrl(tenant, project.ProjectID);

  return {
    externalId: stableBonfireId(tenant, project),
    title: project.ProjectName?.trim() || "Bonfire Opportunity",
    agency: tenant.buyerName,
    type: normalizeType(project.ProjectName),
    status: "active",
    postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline,
    placeOfPerformance: tenant.state,
    solicitationNumber: project.ReferenceID?.trim() || undefined,
    description: project.description?.trim() || undefined,
    sourceUrl: detailUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_portal",
      providerPlatform: "bonfire_euna",
      providerType: "bonfire_public_opportunities_api",
      connectorName: "Bonfire/Euna shared adapter",
      discoveryMethod: "dedicated_official_adapter",
      sourceBadge: "Bonfire Official Portal",
      sourceConfidence: "high",
      sourceId: tenant.portalId,
      tenantSlugOrId: tenant.tenantSlug,
      nativeOpportunityId: project.ProjectID,
      buyerName: tenant.buyerName,
      buyerState: tenant.state,
      listingUrl,
      canonicalUrl: detailUrl,
      listingPage: 1,
      documentUrls: [] as string[],
      dateUnknown: !postedDate,
      deadlineUnknown: !responseDeadline,
      collectedAt: new Date().toISOString(),
      tags: [
        "direct-official-portal",
        "bonfire-euna-platform",
        `state:${tenant.state}`,
        `tenant:${tenant.tenantSlug}`,
        `portal:${tenant.portalId}`,
        ...(!postedDate ? ["date-unknown"] : []),
      ],
    },
  };
}

interface TenantCollectionResult {
  records: NormalizedOpportunity[];
  errors: string[];
}

async function collectTenant(
  tenant: BonfireTenant,
  options: FetchOptions,
): Promise<TenantCollectionResult> {
  const timeoutMs = positiveIntegerEnv("BONFIRE_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, 3_000, 60_000);
  const maxRetries = positiveIntegerEnv("BONFIRE_MAX_RETRIES", DEFAULT_MAX_RETRIES, 0, 5);
  const maxResults = positiveIntegerEnv("BONFIRE_MAX_RESULTS_PER_TENANT", DEFAULT_MAX_RESULTS_PER_TENANT, 1, 200);
  const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
  const errors: string[] = [];

  const apiUrl = publicOpportunitiesUrl(tenant);
  let rawText: string;
  try {
    rawText = await fetchOfficialPortalText(apiUrl, {
      label: `${tenant.portalId} Bonfire opportunities`,
      origin: tenant.origin,
      timeoutMs,
      maxRetries,
      signal: options.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { records: [], errors: [`${tenant.portalId}: ${reason}`] };
  }

  let parsed: BonfireApiResponse;
  try {
    parsed = JSON.parse(rawText) as BonfireApiResponse;
  } catch {
    return { records: [], errors: [`${tenant.portalId}: failed to parse Bonfire API JSON response`] };
  }

  if (!parsed.success || !parsed.payload?.projects) {
    return { records: [], errors: [`${tenant.portalId}: Bonfire API returned success=0 or no projects`] };
  }

  const projects = Object.values(parsed.payload.projects);
  const seenIds = new Set<string>();
  const records: NormalizedOpportunity[] = [];
  const keywords = options.keywords?.toLowerCase().split(/\s+/).filter(Boolean);

  for (const project of projects) {
    if (!project.ProjectID) continue;

    // Filter by keywords if provided
    if (keywords?.length) {
      const haystack = [project.ProjectName, project.ReferenceID, project.description, tenant.buyerName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!keywords.some((kw) => haystack.includes(kw))) continue;
    }

    const record = projectToOpportunity(project, tenant, tenant.listingUrl);
    if (seenIds.has(record.externalId)) continue;
    seenIds.add(record.externalId);
    records.push(record);
    if (records.length >= requestedLimit) break;
  }

  const offset = Math.max(options.offset ?? 0, 0);
  return { records: records.slice(offset, offset + requestedLimit), errors };
}

export class BonfirePortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  constructor(private readonly tenants: readonly BonfireTenant[] = BONFIRE_TENANTS) {}

  async isConfigured(): Promise<boolean> {
    return this.tenants.length > 0;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    for (const tenant of this.tenants) {
      const result = await collectTenant(tenant, options);
      errors.push(...result.errors);
      for (const record of result.records) {
        if (seen.has(record.externalId)) continue;
        seen.add(record.externalId);
        records.push(record);
      }
    }

    this.recordCount = records.length;
    this.lastError = errors.length ? errors.join("; ") : undefined;
    if (!errors.length || records.length) this.lastSuccess = new Date();
    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return {
      name: this.name,
      configured,
      healthy: configured && !this.lastError,
      errorMessage: this.lastError,
      lastAttempt: this.lastAttempt,
      lastSuccess: this.lastSuccess,
      recordCount: this.recordCount,
    };
  }
}

export function bonfireTenantProvider(portalId: string): DataSourceProvider | undefined {
  const tenant = TENANT_BY_PORTAL_ID.get(portalId);
  if (!tenant) return undefined;
  return new BonfirePortalProvider([tenant]);
}

export const bonfirePortalProviders: Record<string, DataSourceProvider> = Object.fromEntries(
  BONFIRE_TENANTS.map((tenant) => [tenant.portalId, new BonfirePortalProvider([tenant])]),
);

// Exported for testing
export { stableBonfireId, projectToOpportunity, UNKNOWN_POSTED_DATE as BONFIRE_UNKNOWN_POSTED_DATE };
