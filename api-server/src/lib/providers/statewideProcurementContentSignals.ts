import { statewideHtmlToText } from "./statewideProcurementParser";

const EXPLICIT_EMPTY_TEXT = /(?:\bno\s+(?:(?:open|active|current|matching|available)\s+)?(?:bids?|solicitations?|opportunities|events?|records?|results?)\b|\bzero\s+(?:results?|records?)\b|\bthere (?:are|is) currently no\b|\byour search (?:returned|found) no\b|\bno items? (?:were )?found\b|\bnothing (?:was )?found\b)/i;
const CLOSED_TEXT = /\b(?:closed|awarded|cancelled|canceled|expired|withdrawn|completed|complete|inactive|pending selection|retracted|under evaluation)\b/i;
const LISTING_HEADER_TEXT = /\b(?:solicitation|bid|rfp|rfq|event|project|opportunity)\b/i;

function jsonHasExplicitEmptyCollection(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(object)) {
    if (!/(?:results?|records?|items?|events?|opportunities|solicitations|bids?|data|projects)/i.test(key)) continue;
    if (Array.isArray(child) && child.length === 0) return true;
    if (child && typeof child === "object" && Object.keys(child as object).length === 0) return true;
  }
  return false;
}

export function statewideContentHasExplicitEmptyEvidence(content: string): boolean {
  const text = statewideHtmlToText(content);
  if (EXPLICIT_EMPTY_TEXT.test(text)) return true;

  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      if (jsonHasExplicitEmptyCollection(JSON.parse(trimmed))) return true;
    } catch {
      // Not JSON; continue with HTML checks.
    }
  }

  const dataRows = Array.from(content.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
    .map((match) => match[0])
    .filter((row) => !/<th\b/i.test(row));
  if (dataRows.length > 0) {
    const tableText = statewideHtmlToText(content);
    if (LISTING_HEADER_TEXT.test(tableText) && dataRows.every((row) => CLOSED_TEXT.test(statewideHtmlToText(row)))) {
      return true;
    }
  }

  return false;
}

export function statewideContentLooksLikeBrowserShell(content: string): boolean {
  const text = statewideHtmlToText(content);
  const hasAppRoot = /(?:id|class)=["'][^"']*(?:app-root|__next|root|app-container|application-root)[^"']*["']/i.test(content)
    || /<app-root\b/i.test(content);
  const hasScriptBundle = /<script\b[^>]*src=["'][^"']+(?:\.js|bundle|chunk)[^"']*["']/i.test(content);
  const hasListingStructure = /<table\b|<tr\b|\b(?:solicitation|bid number|event id|opportunity title)\b/i.test(content);
  return hasAppRoot && hasScriptBundle && !hasListingStructure && text.length < 500;
}
