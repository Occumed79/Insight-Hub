import type { PortalCandidateOpportunity } from "./types";

const DATE_RE = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i;
const JUNK_RE = /\b(login|sign in|register|forgot password|javascript required|access denied|captcha|cookie policy)\b/i;

export function textFromUnknown(data: unknown): string {
  if (typeof data === "string") return data;
  if (data == null) return "";
  try {
    return JSON.stringify(data);
  } catch {
    return "";
  }
}

export function cleanupTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").replace(/^[-–—:\s]+|[-–—:\s]+$/g, "").trim();
  if (cleaned.length < 4 || isJunkText(cleaned)) return undefined;
  return cleaned.slice(0, 300);
}

export function normalizeUrl(value: unknown, baseUrl?: string): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return new URL(value.trim(), baseUrl).toString();
  } catch {
    return undefined;
  }
}

export function extractDate(value: unknown, labels: string[] = []): Date | undefined {
  const text = textFromUnknown(value);
  const labelPattern = labels.length ? new RegExp(`(?:${labels.map(escapeRegExp).join("|")})\\s*[:#-]?\\s*(${DATE_RE.source})`, "i") : undefined;
  const raw = labelPattern?.exec(text)?.[1] ?? DATE_RE.exec(text)?.[0];
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function extractDeadline(value: unknown): Date | undefined {
  return extractDate(value, ["response deadline", "closing date", "close date", "due date", "bid opening", "proposal due", "offers due", "end date"]);
}

export function extractSolicitationNumber(value: unknown): string | undefined {
  const text = textFromUnknown(value);
  const match = /\b(?:solicitation|bid|event|opp(?:ortunity)?|rfp|ifb|itb|cr|project)\s*(?:no\.?|number|#|id)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_.-]{3,})\b/i.exec(text);
  return match?.[1]?.replace(/[),.;]+$/, "");
}

export function isJunkText(value: unknown): boolean {
  const text = textFromUnknown(value);
  return !text.trim() || JUNK_RE.test(text) || text.replace(/\W/g, "").length < 4;
}

export function objectValue(record: Record<string, unknown>, keys: string[]): unknown {
  const found = Object.entries(record).find(([key]) => keys.some((candidate) => key.toLowerCase() === candidate.toLowerCase()));
  return found?.[1];
}

export function candidatesFromRecords(records: unknown[], sourceId: string, state: string | undefined, baseUrl?: string): PortalCandidateOpportunity[] {
  return records.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const record = raw as Record<string, unknown>;
    const title = cleanupTitle(objectValue(record, ["title", "name", "description", "eventTitle", "bidTitle", "solicitationTitle"]));
    const description = cleanupTitle(objectValue(record, ["summary", "description", "abstract", "details"]));
    const sourceUrl = normalizeUrl(objectValue(record, ["url", "link", "sourceUrl", "href", "detailUrl"]), baseUrl);
    const text = textFromUnknown(raw);
    if (!title || isJunkText(text)) return [];
    return [{
      title,
      sourceUrl,
      agency: cleanupTitle(objectValue(record, ["agency", "buyer", "department", "organization", "owner"])),
      solicitationNumber: cleanupTitle(objectValue(record, ["solicitationNumber", "bidNumber", "eventId", "eventNumber", "id"])) ?? extractSolicitationNumber(text),
      postedDate: extractDate(objectValue(record, ["postedDate", "publishDate", "issueDate", "startDate"]) ?? text, ["posted", "published", "issue date", "start date"]),
      responseDeadline: extractDeadline(objectValue(record, ["responseDeadline", "deadline", "closingDate", "dueDate", "endDate"]) ?? text),
      description,
      location: cleanupTitle(objectValue(record, ["location", "placeOfPerformance"])),
      state,
      portalSourceId: sourceId,
      raw,
    }];
  });
}

export function recordsFromInput(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["items", "records", "results", "opportunities", "data"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
    return [obj];
  }
  return [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
