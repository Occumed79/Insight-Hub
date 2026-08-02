/**
 * Lightweight heuristic extraction from raw web snippet text.
 * Used as a fallback when AI is unavailable (quota exhausted, API keys missing).
 * Extracts: deadline dates, estimated dollar value, agency name, location, and contact info.
 * All results are best-effort and may have low precision.
 */

const MONTH_NAMES =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

// Labels that usually precede a deadline
const DEADLINE_LABELS =
  "(?:due|deadline|closes?|closing|submit(?:tal)?(?:\\s+date)?|proposals?\\s+due|responses?\\s+due|receipt\\s+of\\s+proposals?|bid\\s+opening|due\\s+date|response\\s+date)";

const DEADLINE_PATTERNS = [
  // "due: April 15, 2026" or "due by April 15 2026"
  new RegExp(`${DEADLINE_LABELS}[:\\s]+${MONTH_NAMES}\\s+\\d{1,2},?\\s*\\d{4}`, "i"),
  // "April 15, 2026 – due"
  new RegExp(`${MONTH_NAMES}\\s+\\d{1,2},?\\s*(20\\d{2})(?=\\s*[–-]?\\s*${DEADLINE_LABELS})`, "i"),
  // ISO: 2026-04-15
  new RegExp(`${DEADLINE_LABELS}[:\\s]+\\d{4}-\\d{2}-\\d{2}`, "i"),
  // MM/DD/YYYY
  new RegExp(`${DEADLINE_LABELS}[:\\s]+\\d{1,2}\\/\\d{1,2}\\/\\d{4}`, "i"),
  // DD/MM/YYYY (international format)
  new RegExp(`${DEADLINE_LABELS}[:\\s]+\\d{1,2}\\.\\d{1,2}\\.\\d{4}`, "i"),
  // Standalone month-day-year near the end of a sentence (weaker signal)
  new RegExp(`${MONTH_NAMES}\\s+\\d{1,2},?\\s*(20\\d{2})`, "i"),
  // "Deadline: 15th April 2026"
  new RegExp(`${DEADLINE_LABELS}[:\\s]+\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_NAMES}\\s+\\d{4}`, "i"),
];

const VALUE_PATTERNS = [
  // $1.5 million, $250,000, $1M, $500K
  /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(million|M\b|billion|B\b|thousand|K\b)?/i,
  // "250,000 dollars"
  /(\d{1,3}(?:,\d{3})+)\s+dollars?/i,
  // "estimated value: $1.5M"
  /(?:estimated|approx|approximate|maximum|minimum|budget)?\s*(?:value|cost|price|amount)?[:\s]*\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(million|M\b|billion|B\b|thousand|K\b)?/i,
  // "1.5 million dollars"
  /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(million|M\b|billion|B\b|thousand|K\b)?\s+dollars?/i,
];

const AGENCY_PATTERNS = [
  /\bCity of ([A-Z][a-zA-Z\s]{2,30}?)(?:\s*[-–,.|]|\s+is\s|\s+RFP|\s+Request|\s+Bid|$)/,
  /\bCounty of ([A-Z][a-zA-Z\s]{2,25}?)(?:\s*[-–,.|]|\s+is\s|\s+RFP|\s+Request|$)/,
  /\b([A-Z][a-zA-Z]{2,25} County)\b/,
  /\b([A-Z][a-zA-Z]{2,25} City)\b/,
  /\bState of ([A-Z][a-zA-Z]{3,20})\b/,
  /\bDepartment of ([A-Z][a-zA-Z\s]{3,35}?)(?:\s*[-–,]|$)/,
  /\bOffice of ([A-Z][a-zA-Z\s]{3,35}?)(?:\s*[-–,]|$)/,
  /\b([A-Z][a-zA-Z\s]{3,30}?) (?:Authority|Commission|District|Agency|Administration|Board)\b/,
  /\b([A-Z][a-zA-Z\s]{3,30}?) (?:Public Schools|School District|Independent School District)\b/,
  /\b([A-Z][a-zA-Z\s]{3,30}?) (?:University|College|Institute)\b/,
];

const LOCATION_PATTERNS = [
  /\b([A-Z][a-zA-Z\s]{2,25}?)\s*,\s*([A-Z]{2})\b/,
  /\b([A-Z][a-zA-Z\s]{2,25}?)\s*,\s*[A-Z][a-zA-Z\s]{2,25}?\s*,\s*([A-Z]{2})\b/,
  /\b(?:located\s+in|at|in)\s+([A-Z][a-zA-Z\s]{2,30}?)(?:\s*,|\s+|$)/i,
  /\b([A-Z][a-zA-Z]{2,25})\s+(?:County|City|State)\b/,
];

const CONTACT_PATTERNS = [
  /(?:contact|questions|inquiries)[:\s]+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
  /(?:contact|questions|inquiries)[:\s]+(?:tel|phone)?[:\s]*\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/i,
  /\b([A-Z][a-zA-Z\s]{2,30}?)\s+(?:at|@)\s+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i,
];

const SOLICITATION_NUMBER_PATTERNS = [
  /\b(?:solicitation|rfp|rfq|bid|request|proposal)\s*(?:number|no|num|#)?[:\s]*([A-Z0-9-]{4,20})\b/i,
  /\b([A-Z]{2,4}-\d{4,6}-\d{4,6})\b/, // Federal style: ABC12-3456-7890
  /\b(\d{4,6}-\d{4,6})\b/, // State style: 123456-789012
];

function extractDateFromMatch(match: string): Date | undefined {
  // Strip the label prefix so we can parse just the date portion
  const stripped = match
    .replace(new RegExp(DEADLINE_LABELS, "i"), "")
    .replace(/[:\s]+/, "")
    .trim();
  const d = new Date(stripped);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 2024 && d.getFullYear() <= 2030) return d;
  return undefined;
}

export function extractMetadataFromText(
  text: string,
  title?: string
): { 
  deadline?: Date; 
  estimatedValue?: number; 
  agencyHint?: string;
  location?: string;
  contact?: string;
  solicitationNumber?: string;
} {
  const result: { 
    deadline?: Date; 
    estimatedValue?: number; 
    agencyHint?: string;
    location?: string;
    contact?: string;
    solicitationNumber?: string;
  } = {};
  const combined = [title ?? "", text].join(" ");

  // ── Deadline ──
  for (const pattern of DEADLINE_PATTERNS) {
    const match = combined.match(pattern)?.[0];
    if (match) {
      const d = extractDateFromMatch(match);
      if (d) {
        result.deadline = d;
        break;
      }
    }
  }

  // ── Estimated Value ──
  for (const pattern of VALUE_PATTERNS) {
    const m = combined.match(pattern);
    if (m) {
      const raw = parseFloat(m[1].replace(/,/g, ""));
      if (isNaN(raw) || raw <= 0) continue;
      const unit = (m[2] ?? "").toLowerCase();
      let val = raw;
      if (unit.startsWith("b")) val *= 1_000_000_000;
      else if (unit.startsWith("m")) val *= 1_000_000;
      else if (unit.startsWith("k") || unit === "thousand") val *= 1_000;
      // Sanity-check: ignore implausibly small/large values
      if (val >= 1_000 && val <= 10_000_000_000) {
        result.estimatedValue = val;
        break;
      }
    }
  }

  // ── Agency ──
  for (const pattern of AGENCY_PATTERNS) {
    const m = combined.match(pattern)?.[1]?.trim();
    if (m && m.length >= 3 && m.length <= 45) {
      // Filter out common false positives
      if (/^(Request|Bid|Contract|For|The|And|Or|Of|This|That|Any|All|Such)$/i.test(m)) continue;
      result.agencyHint = m;
      break;
    }
  }

  // ── Location ──
  for (const pattern of LOCATION_PATTERNS) {
    const m = combined.match(pattern);
    if (m) {
      // Try to extract city/state or state
      const location = m[1]?.trim() || m[2]?.trim();
      if (location && location.length >= 2 && location.length <= 50) {
        result.location = location;
        break;
      }
    }
  }

  // ── Contact ──
  for (const pattern of CONTACT_PATTERNS) {
    const m = combined.match(pattern);
    if (m) {
      const contact = m[1]?.trim();
      if (contact && contact.length >= 5 && contact.length <= 100) {
        result.contact = contact;
        break;
      }
    }
  }

  // ── Solicitation Number ──
  for (const pattern of SOLICITATION_NUMBER_PATTERNS) {
    const m = combined.match(pattern)?.[1]?.trim();
    if (m && m.length >= 4 && m.length <= 30) {
      result.solicitationNumber = m;
      break;
    }
  }

  return result;
}
