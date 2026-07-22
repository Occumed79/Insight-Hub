import { createHash } from "node:crypto";

import type { NormalizedOpportunity } from "../providers/types";
import type { PublicPortalSource } from "../providers/publicPortalProviders/catalog";

export function stripMarkup(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstString(
  value: unknown,
  paths: readonly string[] | undefined,
): string | undefined {
  if (!paths) return undefined;
  for (const path of paths) {
    const found = readPath(value, path);
    if (typeof found === "string" && found.trim()) return found.trim();
    if (typeof found === "number" && Number.isFinite(found)) return String(found);
  }
  return undefined;
}

export function readPath(value: unknown, path: string): unknown {
  if (!path) return value;
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function readRecordsPath(value: unknown, path?: string): unknown[] {
  const target = path ? readPath(value, path) : value;
  if (Array.isArray(target)) return target;
  if (target && typeof target === "object") {
    const object = target as Record<string, unknown>;
    for (const key of ["results", "items", "records", "data", "rows", "opportunities"]) {
      if (Array.isArray(object[key])) return object[key] as unknown[];
    }
  }
  return [];
}

export function parseCrawlerDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const epoch = new Date(numeric > 10_000_000_000 ? numeric : numeric * 1_000);
    if (!Number.isNaN(epoch.getTime())) return epoch;
  }
  return undefined;
}

export function absoluteUrl(
  value: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

export function stableExternalId(
  sourceId: string,
  ...values: Array<string | undefined>
): string {
  const material = values.filter(Boolean).join("|") || sourceId;
  return `${sourceId}:${createHash("sha1").update(material).digest("hex")}`;
}

export function makeCrawlerOpportunity(options: {
  source: PublicPortalSource;
  externalId?: string;
  title: string;
  agency?: string;
  description?: string;
  solicitationNumber?: string;
  postedDate?: Date;
  responseDeadline?: Date;
  sourceUrl?: string;
  location?: string;
  type?: string;
  rawData?: Record<string, unknown>;
}): NormalizedOpportunity {
  const sourceUrl = options.sourceUrl ?? options.source.sourceUrl;
  const inferredLocation = [
    options.source.city,
    options.source.county,
    options.source.state,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    externalId:
      options.externalId ??
      stableExternalId(
        options.source.id,
        options.solicitationNumber,
        sourceUrl,
        options.title,
      ),
    title: options.title.trim(),
    agency: options.agency?.trim() || options.source.agencyName,
    type: options.type?.trim() || "Solicitation",
    status: "active",
    postedDate: options.postedDate ?? new Date(),
    responseDeadline: options.responseDeadline,
    location: options.location ?? inferredLocation || undefined,
    description: options.description?.trim(),
    solicitationNumber: options.solicitationNumber?.trim(),
    sourceUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "public_portal_crawler",
      sourceId: options.source.id,
      sourceName: options.source.agencyName,
      portalPlatform: options.source.portalPlatform,
      crawlerGenerated: true,
      ...(options.rawData ?? {}),
    },
  };
}

export function xmlBlocks(text: string, tag: string): string[] {
  return [
    ...text.matchAll(
      new RegExp(
        `<[^:>]*:?${tag}\\b[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tag}>`,
        "gi",
      ),
    ),
  ].map((match) => match[1]);
}

export function xmlValue(text: string, tag: string): string | undefined {
  const match = text.match(
    new RegExp(
      `<[^:>]*:?${tag}\\b[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tag}>`,
      "i",
    ),
  );
  return match ? stripMarkup(match[1]) : undefined;
}

export function xmlLink(text: string): string | undefined {
  const direct = xmlValue(text, "link");
  if (direct) return direct;
  return text.match(/<link\b[^>]*href=["']([^"']+)/i)?.[1];
}
