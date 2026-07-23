import { createHash } from "node:crypto";

import { eq, like } from "drizzle-orm";
import { rfpDb as db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import type {
  JsonEndpointSpiderConfig,
  SpiderFieldMap,
} from "./types";

const DISCOVERY_KEY_PREFIX = "internal:crawler-discovery-candidate:";
const SENSITIVE_HEADER_NAME =
  /^(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token|x-access-token)$/i;

export interface StoredDiscoveryCandidate {
  sourceId: string;
  spiderId: string;
  endpointUrl: string;
  pageUrl: string;
  method: string;
  responseContentType?: string;
  paginationMechanism?: string;
  queryParameters?: string[];
  bodyShape?: string[];
  candidateIdentifierFields?: string[];
  candidateTitleFields?: string[];
  candidateStatusFields?: string[];
  candidateDateFields?: string[];
  candidateDetailLinkFields?: string[];
  portalFamily?: string;
  state: "candidate" | "approved" | "rejected";
  approvedConfig?: JsonEndpointSpiderConfig;
  reviewedAt?: string;
  reviewNote?: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ReviewDiscoveryCandidateInput {
  sourceId: string;
  endpointUrl: string;
  decision: "approved" | "rejected";
  note?: string;
  config?: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    recordsPath?: string;
    pagination?: JsonEndpointSpiderConfig["pagination"];
    fields?: Partial<SpiderFieldMap>;
    scheduleMinutes?: number;
    allowedHosts?: string[];
  };
}

export class DiscoveryCandidateNotFoundError extends Error {}

function candidateKey(sourceId: string, endpointUrl: string): string {
  const digest = createHash("sha256").update(endpointUrl).digest("hex");
  return `${DISCOVERY_KEY_PREFIX}${sourceId}:${digest}`;
}

function parseCandidate(value: string): StoredDiscoveryCandidate | undefined {
  try {
    const parsed = JSON.parse(value) as StoredDiscoveryCandidate;
    return parsed.sourceId && parsed.endpointUrl && parsed.pageUrl
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value?.trim()))),
  );
}

function safePublicHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  for (const name of Object.keys(headers)) {
    if (SENSITIVE_HEADER_NAME.test(name.trim())) {
      throw new Error(
        `Public crawler configurations cannot store sensitive header ${name}.`,
      );
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function discoveredDateFields(
  candidate: StoredDiscoveryCandidate,
  type: "posted" | "deadline",
): string[] {
  const fields = candidate.candidateDateFields ?? [];
  const pattern =
    type === "posted"
      ? /post|publish|created|issued|released|opened/i
      : /deadline|due|close|closing|response|end|expire/i;
  return fields.filter((field) => pattern.test(field));
}

function defaultFields(
  candidate: StoredDiscoveryCandidate,
  overrides?: Partial<SpiderFieldMap>,
): SpiderFieldMap {
  const postedDiscovered = discoveredDateFields(candidate, "posted");
  const deadlineDiscovered = discoveredDateFields(candidate, "deadline");
  return {
    id: uniqueStrings([
      ...(overrides?.id ?? []),
      ...(candidate.candidateIdentifierFields ?? []),
      "id",
      "noticeId",
      "solicitationId",
      "bidId",
      "number",
    ]),
    title: uniqueStrings([
      ...(overrides?.title ?? []),
      ...(candidate.candidateTitleFields ?? []),
      "title",
      "name",
      "subject",
      "description",
    ]),
    agency: uniqueStrings([
      ...(overrides?.agency ?? []),
      "agency",
      "agencyName",
      "department",
      "buyerName",
      "organization",
    ]),
    description: uniqueStrings([
      ...(overrides?.description ?? []),
      "description",
      "summary",
      "details",
      "scope",
    ]),
    solicitationNumber: uniqueStrings([
      ...(overrides?.solicitationNumber ?? []),
      "solicitationNumber",
      "solicitation",
      "bidNumber",
      "referenceNumber",
      "number",
    ]),
    postedDate: uniqueStrings([
      ...(overrides?.postedDate ?? []),
      ...postedDiscovered,
      "postedDate",
      "publishDate",
      "publishedAt",
      "createdDate",
      "datePosted",
    ]),
    responseDeadline: uniqueStrings([
      ...(overrides?.responseDeadline ?? []),
      ...deadlineDiscovered,
      "responseDeadline",
      "closingDate",
      "closeDate",
      "dueDate",
      "deadline",
    ]),
    status: uniqueStrings([
      ...(overrides?.status ?? []),
      ...(candidate.candidateStatusFields ?? []),
      "status",
      "state",
    ]),
    detailUrl: uniqueStrings([
      ...(overrides?.detailUrl ?? []),
      ...(candidate.candidateDetailLinkFields ?? []),
      "detailUrl",
      "url",
      "link",
      "href",
    ]),
    location: uniqueStrings([
      ...(overrides?.location ?? []),
      "location",
      "placeOfPerformance",
      "state",
    ]),
    type: uniqueStrings([
      ...(overrides?.type ?? []),
      "type",
      "noticeType",
      "solicitationType",
    ]),
  };
}

function inferredPagination(
  candidate: StoredDiscoveryCandidate,
): JsonEndpointSpiderConfig["pagination"] {
  const mode = candidate.paginationMechanism;
  if (mode === "page") {
    return {
      mode: "page",
      parameter:
        candidate.queryParameters?.find((value) => /page/i.test(value)) ??
        "page",
      pageSizeParameter:
        candidate.queryParameters?.find((value) => /limit|size|count/i.test(value)) ??
        "limit",
      pageSize: 100,
    };
  }
  if (mode === "offset") {
    return {
      mode: "offset",
      parameter:
        candidate.queryParameters?.find((value) => /offset|skip/i.test(value)) ??
        "offset",
      pageSizeParameter:
        candidate.queryParameters?.find((value) => /limit|size|count/i.test(value)) ??
        "limit",
      pageSize: 100,
    };
  }
  if (mode === "cursor") {
    return {
      mode: "cursor",
      parameter:
        candidate.queryParameters?.find((value) => /cursor|next/i.test(value)) ??
        "cursor",
    };
  }
  return { mode: "none" };
}

export function buildApprovedDiscoverySpiderConfig(
  candidate: StoredDiscoveryCandidate,
  input: ReviewDiscoveryCandidateInput,
): JsonEndpointSpiderConfig {
  const endpoint = new URL(candidate.endpointUrl);
  const page = new URL(candidate.pageUrl);
  const method =
    input.config?.method ??
    (candidate.method.toUpperCase() === "POST" ? "POST" : "GET");
  if (method === "POST" && !input.config?.body) {
    throw new Error(
      "Approving a POST endpoint requires an explicit request body template.",
    );
  }
  return {
    id: `public-portal:${candidate.sourceId}`,
    sourceId: candidate.sourceId,
    kind: "json_endpoint",
    enabled: true,
    startUrls: [candidate.pageUrl],
    allowedHosts: uniqueStrings([
      endpoint.hostname,
      page.hostname,
      ...(input.config?.allowedHosts ?? []),
    ]),
    endpointUrl: candidate.endpointUrl,
    method,
    headers: safePublicHeaders(input.config?.headers),
    body: input.config?.body,
    recordsPath: input.config?.recordsPath,
    pagination: input.config?.pagination ?? inferredPagination(candidate),
    fields: defaultFields(candidate, input.config?.fields),
    scheduleMinutes: Math.max(5, input.config?.scheduleMinutes ?? 60),
    limits: {
      maxPages: 5,
      maxUrls: 100,
      elapsedMs: 30_000,
    },
    notes: `Approved from browser discovery candidate ${candidate.endpointUrl}`,
  };
}

async function writeCandidate(
  candidate: StoredDiscoveryCandidate,
): Promise<void> {
  const value = JSON.stringify(candidate);
  await db
    .insert(settingsTable)
    .values({ key: candidateKey(candidate.sourceId, candidate.endpointUrl), value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

export async function saveDiscoveryCandidates(
  sourceId: string,
  spiderId: string,
  candidates: unknown[],
): Promise<number> {
  let saved = 0;
  const now = new Date().toISOString();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const value = candidate as Record<string, unknown>;
    if (
      typeof value.endpointUrl !== "string" ||
      typeof value.pageUrl !== "string"
    )
      continue;
    const key = candidateKey(sourceId, value.endpointUrl);
    const [existingRow] = await db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, key))
      .limit(1);
    const existing = existingRow ? parseCandidate(existingRow.value) : undefined;
    const stored: StoredDiscoveryCandidate = {
      sourceId,
      spiderId,
      endpointUrl: value.endpointUrl,
      pageUrl: value.pageUrl,
      method: typeof value.method === "string" ? value.method : "GET",
      responseContentType:
        typeof value.responseContentType === "string"
          ? value.responseContentType
          : undefined,
      paginationMechanism:
        typeof value.paginationMechanism === "string"
          ? value.paginationMechanism
          : undefined,
      queryParameters: Array.isArray(value.queryParameters)
        ? value.queryParameters.filter(
            (item): item is string => typeof item === "string",
          )
        : undefined,
      bodyShape: Array.isArray(value.bodyShape)
        ? value.bodyShape.filter(
            (item): item is string => typeof item === "string",
          )
        : undefined,
      candidateIdentifierFields: Array.isArray(
        value.candidateIdentifierFields,
      )
        ? value.candidateIdentifierFields.filter(
            (item): item is string => typeof item === "string",
          )
        : undefined,
      candidateTitleFields: Array.isArray(value.candidateTitleFields)
        ? value.candidateTitleFields.filter(
            (item): item is string => typeof item === "string",
          )
        : undefined,
      candidateStatusFields: Array.isArray(value.candidateStatusFields)
        ? value.candidateStatusFields.filter(
            (item): item is string => typeof item === "string",
          )
        : undefined,
      candidateDateFields: Array.isArray(value.candidateDateFields)
        ? value.candidateDateFields.filter(
            (item): item is string => typeof item === "string",
          )
        : undefined,
      candidateDetailLinkFields: Array.isArray(
        value.candidateDetailLinkFields,
      )
        ? value.candidateDetailLinkFields.filter(
            (item): item is string => typeof item === "string",
          )
        : undefined,
      portalFamily:
        typeof value.portalFamily === "string" ? value.portalFamily : undefined,
      state: existing?.state ?? "candidate",
      approvedConfig: existing?.approvedConfig,
      reviewedAt: existing?.reviewedAt,
      reviewNote: existing?.reviewNote,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    };
    await writeCandidate(stored);
    saved += 1;
  }
  return saved;
}

export async function reviewDiscoveryCandidate(
  input: ReviewDiscoveryCandidateInput,
): Promise<StoredDiscoveryCandidate> {
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, candidateKey(input.sourceId, input.endpointUrl)))
    .limit(1);
  const candidate = row ? parseCandidate(row.value) : undefined;
  if (!candidate) {
    throw new DiscoveryCandidateNotFoundError(
      `Discovery candidate not found for ${input.sourceId}`,
    );
  }
  const reviewedAt = new Date().toISOString();
  const updated: StoredDiscoveryCandidate = {
    ...candidate,
    state: input.decision,
    approvedConfig:
      input.decision === "approved"
        ? buildApprovedDiscoverySpiderConfig(candidate, input)
        : undefined,
    reviewedAt,
    reviewNote: input.note?.trim() || undefined,
    lastSeenAt: candidate.lastSeenAt,
  };
  await writeCandidate(updated);
  return updated;
}

export async function listDiscoveryCandidates(): Promise<
  StoredDiscoveryCandidate[]
> {
  const rows = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(like(settingsTable.key, `${DISCOVERY_KEY_PREFIX}%`));
  return rows
    .flatMap((row) => {
      const parsed = parseCandidate(row.value);
      return parsed ? [parsed] : [];
    })
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
}

export async function listApprovedDiscoverySpiderConfigs(): Promise<
  JsonEndpointSpiderConfig[]
> {
  return (await listDiscoveryCandidates()).flatMap((candidate) =>
    candidate.state === "approved" && candidate.approvedConfig
      ? [candidate.approvedConfig]
      : [],
  );
}
