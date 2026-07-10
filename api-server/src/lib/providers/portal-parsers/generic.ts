import { candidatesFromRecords, cleanupTitle, extractDate, extractDeadline, extractSolicitationNumber, isJunkText, normalizeUrl, recordsFromInput, textFromUnknown } from "./helpers";
import type { PortalParser } from "./types";

export function createPortalParser(state?: string): PortalParser {
  return ({ sourceId, data, baseUrl }) => {
    try {
      const structured = candidatesFromRecords(recordsFromInput(data), sourceId, state, baseUrl);
      if (structured.length > 0) return structured;

      const text = textFromUnknown(data);
      if (isJunkText(text)) return [];
      const title = cleanupTitle(/<title[^>]*>(.*?)<\/title>/is.exec(text)?.[1] ?? /(?:title|subject)\s*[:#-]\s*(.+)/i.exec(text)?.[1]);
      if (!title) return [];
      const sourceUrl = normalizeUrl(/href=["']([^"']+)["']/i.exec(text)?.[1], baseUrl);
      return [{
        title,
        sourceUrl,
        agency: cleanupTitle(/(?:agency|buyer|department)\s*[:#-]\s*(.+)/i.exec(text)?.[1]),
        solicitationNumber: extractSolicitationNumber(text),
        postedDate: extractDate(text, ["posted", "published", "issue date"]),
        responseDeadline: extractDeadline(text),
        description: cleanupTitle(/(?:summary|description)\s*[:#-]\s*(.+)/i.exec(text)?.[1]),
        state,
        portalSourceId: sourceId,
        raw: data,
      }];
    } catch {
      return [];
    }
  };
}
