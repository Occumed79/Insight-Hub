import { candidatesFromRecords, cleanupTitle, extractDate, extractDeadline, extractSolicitationNumber, isJunkText, normalizeUrl, recordsFromInput, textFromUnknown } from "./helpers";
import type { PortalCandidateOpportunity, PortalParser } from "./types";

export interface PortalParserFieldMap {
  title?: string[];
  sourceUrl?: string[];
  agency?: string[];
  solicitationNumber?: string[];
  postedDate?: string[];
  responseDeadline?: string[];
  description?: string[];
  location?: string[];
}

export interface PortalParserConfig {
  state?: string;
  baseUrl?: string;
  fieldMap?: PortalParserFieldMap;
  textPatterns?: {
    title?: RegExp[];
    sourceUrl?: RegExp[];
    agency?: RegExp[];
    solicitationNumber?: RegExp[];
    postedDateLabels?: string[];
    deadlineLabels?: string[];
    description?: RegExp[];
    location?: RegExp[];
  };
}

const DEFAULT_TEXT_PATTERNS: Required<NonNullable<PortalParserConfig["textPatterns"]>> = {
  title: [/<title[^>]*>(.*?)<\/title>/is, /(?:title|subject)\s*[:#-]\s*(.+)/i],
  sourceUrl: [/href=["']([^"']+)["']/i],
  agency: [/(?:agency|buyer|department|issuing office)\s*[:#-]\s*(.+)/i],
  solicitationNumber: [/(?:solicitation|bid|event|rfp|ifb|itb|cr|project)\s*(?:no\.?|number|#|id)?\s*[:#-]\s*([A-Z0-9][A-Z0-9_.-]{3,})/i],
  postedDateLabels: ["posted", "published", "issue date", "advertisement date", "publication date"],
  deadlineLabels: ["response deadline", "closing date", "close date", "due date", "bid opening", "proposal due", "offers due", "end date"],
  description: [/(?:summary|description|synopsis|scope)\s*[:#-]\s*(.+)/i],
  location: [/(?:location|state|place of performance)\s*[:#-]\s*(.+)/i],
};

export function createPortalParser(config: PortalParserConfig = {}): PortalParser {
  return ({ sourceId, data, baseUrl }) => {
    try {
      const parserBaseUrl = baseUrl ?? config.baseUrl;
      const records = recordsFromInput(data);
      const structured = candidatesFromRecords(records, sourceId, config.state, parserBaseUrl, config.fieldMap);
      if (structured.length > 0) return structured;
      return parseTextInput(data, sourceId, config, parserBaseUrl);
    } catch {
      return [];
    }
  };
}

function parseTextInput(data: unknown, sourceId: string, config: PortalParserConfig, baseUrl?: string): PortalCandidateOpportunity[] {
  const text = textFromUnknown(data);
  if (isJunkText(text)) return [];

  const patterns = mergePatterns(config.textPatterns);
  const title = cleanupTitle(firstMatch(text, patterns.title));
  if (!title) return [];

  const solicitationNumber = cleanupTitle(firstMatch(text, patterns.solicitationNumber)) ?? extractSolicitationNumber(text);
  return [{
    title,
    sourceUrl: normalizeUrl(firstMatch(text, patterns.sourceUrl), baseUrl),
    agency: cleanupTitle(firstMatch(text, patterns.agency)),
    solicitationNumber,
    postedDate: extractDate(text, patterns.postedDateLabels),
    responseDeadline: extractDeadlineWithLabels(text, patterns.deadlineLabels),
    description: cleanupTitle(firstMatch(text, patterns.description)),
    location: cleanupTitle(firstMatch(text, patterns.location)),
    state: config.state,
    portalSourceId: sourceId,
    raw: data,
  }];
}

function mergePatterns(patterns: PortalParserConfig["textPatterns"]): Required<NonNullable<PortalParserConfig["textPatterns"]>> {
  return {
    title: [...(patterns?.title ?? []), ...DEFAULT_TEXT_PATTERNS.title],
    sourceUrl: [...(patterns?.sourceUrl ?? []), ...DEFAULT_TEXT_PATTERNS.sourceUrl],
    agency: [...(patterns?.agency ?? []), ...DEFAULT_TEXT_PATTERNS.agency],
    solicitationNumber: [...(patterns?.solicitationNumber ?? []), ...DEFAULT_TEXT_PATTERNS.solicitationNumber],
    postedDateLabels: [...(patterns?.postedDateLabels ?? []), ...DEFAULT_TEXT_PATTERNS.postedDateLabels],
    deadlineLabels: [...(patterns?.deadlineLabels ?? []), ...DEFAULT_TEXT_PATTERNS.deadlineLabels],
    description: [...(patterns?.description ?? []), ...DEFAULT_TEXT_PATTERNS.description],
    location: [...(patterns?.location ?? []), ...DEFAULT_TEXT_PATTERNS.location],
  };
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function extractDeadlineWithLabels(text: string, labels: string[]): Date | undefined {
  return extractDate(text, labels) ?? extractDeadline(text);
}
