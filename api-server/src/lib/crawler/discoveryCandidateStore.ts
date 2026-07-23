import { createHash } from "node:crypto";

import { eq, like } from "drizzle-orm";
import { rfpDb as db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";

const DISCOVERY_KEY_PREFIX = "internal:crawler-discovery-candidate:";

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
  firstSeenAt: string;
  lastSeenAt: string;
}

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
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    };
    const serialized = JSON.stringify(stored);
    await db
      .insert(settingsTable)
      .values({ key, value: serialized })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value: serialized },
      });
    saved += 1;
  }
  return saved;
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
