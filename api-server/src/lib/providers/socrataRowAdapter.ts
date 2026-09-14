import { composeAbortSignal } from "./abortSignals";
import type { NormalizedOpportunity } from "./types";
import type {
  SocrataDatasetProfile,
  SocrataFieldMap,
} from "./socrataDatasetProfiles";
import { classifyResult } from "../search/relevance";

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 500;
const REQUEST_TIMEOUT_MS = 20_000;
const PROFILE_VERSION = 1;

export type SocrataRowRejectReason =
  | "wrong_dataset_class"
  | "missing_identity"
  | "closed"
  | "expired"
  | "irrelevant";

export interface SocrataRowDecision {
  record: NormalizedOpportunity | null;
  reason: SocrataRowRejectReason | null;
}

export interface SocrataQueryOptions {
  pageNumber?: number;
  pageSize?: number;
  signal?: AbortSignal;
  query?: string;
}

function stringValue(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function firstMapped(
  row: Record<string, unknown>,
  aliases: readonly string[],
): string | null {
  for (const alias of aliases) {
    const value = stringValue(row[alias]);
    if (value) return value;
  }
  return null;
}

function allMapped(
  row: Record<string, unknown>,
  aliases: readonly string[],
): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const alias of aliases) {
    const value = stringValue(row[alias]);
    if (value && !seen.has(value)) {
      seen.add(value);
      values.push(value);
    }
  }
  return values;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[$,\s]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function looksClosed(value: string | null): boolean {
  return Boolean(
    value &&
      /\b(?:closed|cancelled|canceled|awarded|award|expired|inactive|completed)\b/i.test(
        value,
      ),
  );
}

function fallbackSourceUrl(profile: SocrataDatasetProfile): string {
  return `https://${profile.domain}/d/${profile.datasetId}`;
}

function buildDescription(
  row: Record<string, unknown>,
  map: SocrataFieldMap,
): string | undefined {
  const values = allMapped(row, map.description);
  return values.length ? values.join("\n\n") : undefined;
}

function solicitationNumber(
  row: Record<string, unknown>,
  map: SocrataFieldMap,
): string | undefined {
  const preferred = [
    "pin",
    "solicitation_number",
    "event",
    "number",
    "request_id",
    ...map.id,
  ];
  return firstMapped(row, Array.from(new Set(preferred))) ?? undefined;
}

/**
 * Convert one row from a registry-qualified live Socrata dataset into the
 * shared opportunity shape. Dataset trust supplies procurement context only;
 * the shared Occu-Med relevance engine still requires service evidence.
 */
export function normalizeSocrataRow(
  profile: SocrataDatasetProfile,
  row: Record<string, unknown>,
  now = new Date(),
): SocrataRowDecision {
  if (!profile.enabled || profile.datasetClass !== "live_solicitations") {
    return { record: null, reason: "wrong_dataset_class" };
  }

  const rowPrimaryKey = firstMapped(row, profile.fieldMap.id);
  const title = firstMapped(row, profile.fieldMap.title);
  const agency = firstMapped(row, profile.fieldMap.agency);
  if (!rowPrimaryKey || !title || !agency) {
    return { record: null, reason: "missing_identity" };
  }

  const statusText = firstMapped(row, profile.fieldMap.status);
  const type = firstMapped(row, profile.fieldMap.type) ?? "Solicitation";
  if (looksClosed(statusText) || looksClosed(type)) {
    return { record: null, reason: "closed" };
  }

  const deadline = parseDate(firstMapped(row, profile.fieldMap.deadline));
  if (deadline && deadline.getTime() <= now.getTime()) {
    return { record: null, reason: "expired" };
  }

  const postedDate = parseDate(firstMapped(row, profile.fieldMap.postedDate));
  const description = buildDescription(row, profile.fieldMap);
  const rowUrl = firstMapped(row, profile.fieldMap.sourceUrl);
  const sourceUrl = rowUrl ?? fallbackSourceUrl(profile);
  const relevance = classifyResult({
    title,
    description,
    url: sourceUrl,
    date: postedDate,
    deadlineInFuture: Boolean(deadline && deadline.getTime() > now.getTime()),
    allowHistorical: true,
    trustedProcurementContext: true,
  });
  if (relevance.rejected) {
    return { record: null, reason: "irrelevant" };
  }

  const estimatedValue = parseNumber(
    firstMapped(row, profile.fieldMap.value),
  );
  const record: NormalizedOpportunity = {
    externalId: `socrata:${profile.domain}:${profile.datasetId}:${rowPrimaryKey}`,
    title,
    agency,
    type,
    status: "active",
    postedDate: postedDate ?? new Date(0),
    responseDeadline: deadline ?? undefined,
    description,
    solicitationNumber: solicitationNumber(row, profile.fieldMap),
    sourceUrl,
    estimatedValue,
    source: "socrata",
    providerName: "socrata",
    rawData: {
      sourceConfidence: "high",
      providerPlatform: "socrata",
      evidence: "direct-structured",
      dateUnknown: !postedDate,
      trustedProcurementContext: true,
      relevanceScore: relevance.score,
      relevanceReasons: relevance.reasons,
      socrata: {
        domain: profile.domain,
        datasetId: profile.datasetId,
        datasetLabel: profile.label,
        datasetClass: profile.datasetClass,
        profileVersion: PROFILE_VERSION,
        row,
      },
    },
  };

  return { record, reason: null };
}

function boundedPageSize(value: number | undefined): number {
  const configured = Number(process.env.SOCRATA_MAX_ROWS_PER_DATASET);
  const fallback = Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_PAGE_SIZE;
  const requested = Number.isFinite(value) && Number(value) > 0
    ? Number(value)
    : fallback;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.trunc(requested)));
}

export function buildSocrataQuery(
  profile: SocrataDatasetProfile,
): string {
  const clauses = ["SELECT *"];
  if (profile.openPredicate?.trim()) clauses.push(`WHERE ${profile.openPredicate.trim()}`);
  if (profile.orderBy?.trim()) clauses.push(`ORDER BY ${profile.orderBy.trim()}`);
  return clauses.join(" ");
}

/** Execute one curated dataset query using Tyler/Socrata SODA3. */
export async function querySocrataDataset(
  profile: SocrataDatasetProfile,
  headers: Record<string, string>,
  options: SocrataQueryOptions = {},
): Promise<Record<string, unknown>[]> {
  if (!profile.enabled) return [];
  const endpoint = `https://${profile.domain}/api/v3/views/${profile.datasetId}/query.json`;
  const requestSignal = composeAbortSignal(REQUEST_TIMEOUT_MS, options.signal);
  const pageSize = boundedPageSize(options.pageSize);
  const pageNumber = Math.max(1, Math.trunc(options.pageNumber ?? 1));
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        query: options.query ?? buildSocrataQuery(profile),
        page: { pageNumber, pageSize },
        includeSynthetic: false,
      }),
      signal: requestSignal.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `Socrata SODA3 ${profile.key} error ${response.status}: ${body.slice(0, 300)}`,
      );
    }
    const parsed = JSON.parse(body) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`Socrata SODA3 ${profile.key} returned a non-array response.`);
    }
    return parsed.filter(
      (row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)),
    );
  } finally {
    requestSignal.cleanup();
  }
}
