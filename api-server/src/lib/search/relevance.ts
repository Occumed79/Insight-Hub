/**
 * Shared Occu-Med relevance engine.
 *
 * Single source of truth for:
 *  - term lists (hard-reject junk, soft-penalty noise, procurement signals,
 *    Occu-Med service signals, prime/defense-contractor signals)
 *  - transparent relevance scoring with human-readable reasons (used for ranking
 *    AND surfaced in the UI)
 *  - publication-date parsing + freshness handling
 *  - a deterministic heuristic fallback used when AI extraction is unavailable
 *
 * Both the write-time pipeline (unifiedSearch / webIntelligence) and the
 * read-time list filter (routes/opportunities) import from here so the two
 * layers can never drift apart.
 */

export const CURRENT_YEAR = new Date().getFullYear();

/**
 * Definite junk — if any of these appear we never want the result, regardless
 * of other signals. Jobs/careers/hiring, clinical staffing, awards, and
 * unrelated service lines. Spaces are padded where needed to avoid matching
 * inside larger words (e.g. " rn " should not match "learn").
 */
export const HARD_REJECT_TERMS: string[] = [
  // Jobs / careers / hiring
  "job posting", "job opening", "job opportunity", "jobs in", "now hiring",
  " hiring ", "we're hiring", "career opportunity", "careers at", "/careers",
  "employment opportunity", "apply now", "submit resume", "send resume",
  "salary", "hourly pay", "per hour", "full-time position", "part-time position",
  "position available", "open position", "staffing job", "travel nurse",
  "nurse job", "ambulance job", "emt job", "paramedic job", "rn job",
  // Clinical roles / staffing (Occu-Med sells services, not labor)
  " lvn ", " lpn ", " cna ", " rn ", "registered nurse", "licensed vocational",
  "nurse staffing", "medical staffing", "staff augmentation", "locum",
  "temporary staffing", "phlebotomist", "radiology technologist", "mri tech",
  "ct tech", "sonographer", "dental assistant", "dental hygienist",
  // Schools / training / resumes
  "training program", "training course", "certification course", " course ",
  "nursing school", "medical school", "community college", "resume",
  // Already-awarded / not biddable
  "contract awarded", "award notice", "awarded to", "selected vendor",
  "notice of award", "intent to award", "sole source award", "bid tabulation",
  // Unrelated service lines / noise
  "pharmacy", "pharmaceutical", "marijuana", "cannabis", "veterinary",
  "animal health", "pest control", "janitorial", "landscaping",
  "food service", "meal delivery", "wic program",
  "health insurance", "health benefits", "claims administration",
  "electronic health record", "ehr implementation", "emr system",
  "telehealth platform", "telemedicine software",
  "social security disability", "disability adjudication",
];

/**
 * Domains that are always junk for procurement discovery (job boards, social
 * media, consumer-health content, encyclopedias).
 */
export const BLOCKED_DOMAINS: string[] = [
  "indeed.com", "linkedin.com", "ziprecruiter.com", "glassdoor.com",
  "talent.com", "monster.com", "careerbuilder.com", "simplyhired.com",
  "snagajob.com", "dice.com", "lensa.com",
  "facebook.com", "twitter.com", "x.com", "instagram.com", "reddit.com",
  "youtube.com", "tiktok.com", "pinterest.com",
  "wikipedia.org", "britannica.com", "webmd.com", "healthline.com",
  "mayoclinic.org", "wikihow.com",
];

/**
 * Soft-penalty terms — reduce the score and add a transparency reason, but do
 * not hard-reject (the result may still be useful, just ranked lower).
 */
export const SOFT_PENALTY_TERMS: string[] = [
  "news", "press release", "blog", "article", "webinar", "podcast",
  "definition", "what is", "how to", "guide to", "overview of",
];

/**
 * Procurement / opportunity signals (the "RFP" axis).
 */
export const PROCUREMENT_SIGNALS: string[] = [
  "rfp", "request for proposal", "request for proposals", "request for quote",
  "request for quotation", "request for information", "rfq", "rfi",
  "solicitation", "invitation to bid", "invitation for bid", "itb", "ifb",
  "sources sought", "sources-sought", "presolicitation", "pre-solicitation",
  "bid opportunity", "bid opportunities", "bid solicitation", "open bid",
  "tender", "procurement", "contract opportunity", "competitive bid",
  "proposals due", "responses due", "bid due", "response due", "closing date",
  "subcontracting opportunity", "subcontractor opportunity", "teaming opportunity",
  "vendor onboarding", "provider agreement", "supplier registration",
];

/**
 * Occu-Med service signals (the "service relevance" axis), grouped by category
 * so we can report which category matched.
 */
export const SERVICE_CATEGORIES: { category: string; terms: string[] }[] = [
  {
    category: "occupational health",
    terms: [
      "occupational health", "occupational medicine", "occupational medical",
      "occ health", "occmed", "employee health", "workplace health",
      "workforce health", "employer health services", "onsite clinic",
      "onsite medical", "clinic network", "provider network",
    ],
  },
  {
    category: "drug & alcohol screening",
    terms: [
      "drug testing", "drug screening", "drug screen", "drug test",
      "alcohol testing", "substance abuse testing", "random drug",
      "dot drug", "dot alcohol", "urine drug screen", "breath alcohol",
    ],
  },
  {
    category: "DOT / fitness-for-duty exams",
    terms: [
      "dot physical", "dot examination", "dot medical", "fmcsa physical",
      "medical examiner", "fit for duty", "fitness for duty",
      "work capacity evaluation", "functional capacity",
    ],
  },
  {
    category: "pre-employment / physicals",
    terms: [
      "pre-employment physical", "pre employment physical", "pre-placement",
      "pre-employment screening", "pre-employment medical", "annual physical",
      "periodic medical", "medical fitness", "return to work", "return-to-work",
      "return to duty",
    ],
  },
  {
    category: "medical surveillance",
    terms: [
      "medical surveillance", "health surveillance", "biological monitoring",
      "bloodborne pathogen", "hazmat medical", "osha compliance",
      "respirator fit", "fit testing", "respirator medical", "pulmonary function",
      "spirometry", "audiogram", "audiometric", "hearing conservation",
      "hearing test", "vision testing", "vaccination", "immunization",
      "titer", "tb test", "tuberculosis testing", "quantiferon",
    ],
  },
  {
    category: "deployment / military medical",
    terms: [
      "deployment medical", "pre-deployment", "periodic health assessment",
      "pha exam", "separation physical", "military physical",
      "medical readiness", "occupational health support services",
    ],
  },
];

const ALL_SERVICE_TERMS: string[] = SERVICE_CATEGORIES.flatMap((c) => c.terms);

/**
 * Prime / defense contractors and adjacent players. These are not government
 * portals, but RFPs/subcontracting from them are highly relevant to Occu-Med.
 */
export const PRIME_CONTRACTOR_SIGNALS: string[] = [
  "logcap", "afcap", "v2x", "amentum", "kbr", "fluor", "pae", "vectrus",
  "dyncorp", "leidos", "acuity international", "qtc", "leidos qtc",
  "international sos", "workcare", "concentra", "premise health",
  "defense contractor", "government contractor", "prime contractor",
  "federal contractor", "subcontractor", "teaming partner",
];

/**
 * Procurement portals / government domains worth a domain boost.
 */
const PROCUREMENT_DOMAINS: string[] = [
  ".gov", "sam.gov", "demandstar.com", "bidsync.com", "bidnet.com",
  "publicpurchase.com", "bonfirehub.com", "planetbids.com", "ionwave.net",
  "periscopeholdings.com", "grants.gov", "merx.com", "govwin.com",
];

function norm(s: string | null | undefined): string {
  return ` ${(s ?? "").toLowerCase().replace(/[\s\n\r]+/g, " ")} `;
}

function hasAny(haystack: string, terms: string[]): boolean {
  return terms.some((t) => haystack.includes(t));
}

function firstMatch(haystack: string, terms: string[]): string | null {
  return terms.find((t) => haystack.includes(t)) ?? null;
}

export function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function isBlockedDomain(url: string | null | undefined): boolean {
  const host = hostFromUrl(url);
  if (!host) return false;
  return BLOCKED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Parse a publication/last-updated date from a free-form string.
 * Handles relative ("3 days ago", "2 weeks ago") and absolute dates.
 */
export function parseResultDate(raw: string | Date | null | undefined): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;

  const s = raw.trim().toLowerCase();

  const rel = s.match(/(\d+)\s+(hour|day|week|month|year)s?\s+ago/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2];
    const d = new Date();
    if (unit === "hour") d.setHours(d.getHours() - n);
    else if (unit === "day") d.setDate(d.getDate() - n);
    else if (unit === "week") d.setDate(d.getDate() - n * 7);
    else if (unit === "month") d.setMonth(d.getMonth() - n);
    else if (unit === "year") d.setFullYear(d.getFullYear() - n);
    return d;
  }
  if (/(yesterday|today|hours? ago|minutes? ago)/.test(s)) return new Date();

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000 && parsed.getFullYear() <= CURRENT_YEAR + 2) {
    return parsed;
  }
  return null;
}

export interface RelevanceInput {
  title?: string | null;
  snippet?: string | null;
  description?: string | null;
  url?: string | null;
  date?: string | Date | null;
  /** Whether a deadline is in the future (helps confirm the bid is open). */
  deadlineInFuture?: boolean;
  /** Optional user keywords from the search box. */
  keywords?: string | null;
  /** Treat older results as acceptable (user explicitly asked for history). */
  allowHistorical?: boolean;
}

export interface RelevanceResult {
  /** 0-100 transparent relevance score. */
  score: number;
  /** Short, UI-friendly reasons (e.g. "Matched occupational health + RFP"). */
  reasons: string[];
  /** True when the result should be dropped entirely (junk / off-domain). */
  rejected: boolean;
  rejectReason: string | null;
  /** Best-guess service category that matched, if any. */
  category: string | null;
  /** Parsed publication date, if one could be detected. */
  publishedDate: Date | null;
  /** True when the only date signal points to a stale (pre-current-year) result. */
  stale: boolean;
}

/**
 * Score a single result for Occu-Med relevance with transparent reasons.
 */
export function classifyResult(input: RelevanceInput): RelevanceResult {
  const haystack = norm([input.title, input.snippet, input.description].filter(Boolean).join(" "));
  const titleNorm = norm(input.title);
  const reasons: string[] = [];

  // ── Hard rejects ──
  if (isBlockedDomain(input.url)) {
    return rejected("Excluded: job board / non-procurement domain", haystack, input);
  }
  const junk = firstMatch(haystack, HARD_REJECT_TERMS);
  if (junk) {
    return rejected(`Excluded due to job/careers/off-topic wording ("${junk.trim()}")`, haystack, input);
  }

  // ── Signal detection ──
  const hasProcurement = hasAny(haystack, PROCUREMENT_SIGNALS);
  const serviceCategory = SERVICE_CATEGORIES.find((c) => hasAny(haystack, c.terms))?.category ?? null;
  const hasService = serviceCategory != null;
  const hasPrime = hasAny(haystack, PRIME_CONTRACTOR_SIGNALS);

  let score = 30; // neutral baseline

  if (hasService && hasProcurement) {
    score += 45;
    reasons.push(`Matched ${serviceCategory} + RFP/procurement`);
  } else if (hasService) {
    score += 30;
    reasons.push(`High relevance to ${serviceCategory}`);
  } else if (hasProcurement) {
    score += 12;
    reasons.push("Procurement/RFP language (service relevance unclear)");
  }

  if (hasPrime) {
    score += 12;
    reasons.push("Defense/prime-contractor signal");
  }

  // ── Domain boost ──
  const host = hostFromUrl(input.url);
  if (host && PROCUREMENT_DOMAINS.some((d) => host === d.replace(/^\./, "") || host.endsWith(d))) {
    score += 12;
    reasons.push("Government / procurement-portal source");
  }

  // ── Date freshness ──
  const publishedDate = parseResultDate(input.date ?? null);
  let stale = false;
  if (publishedDate) {
    const y = publishedDate.getFullYear();
    if (y >= CURRENT_YEAR) {
      score += 15;
      reasons.push("Recent result");
    } else if (y === CURRENT_YEAR - 1) {
      score += 2;
    } else if (!input.allowHistorical) {
      score -= 22;
      stale = true;
      reasons.push(`Older result (${y}) ranked down`);
    }
  } else {
    score -= 5;
    reasons.push("Date unknown");
  }

  if (input.deadlineInFuture) {
    score += 10;
    reasons.push("Open deadline");
  }

  // ── Soft-penalty noise ──
  const noise = firstMatch(haystack, SOFT_PENALTY_TERMS);
  if (noise && !hasProcurement) {
    score -= 15;
    reasons.push(`Lower priority: news/informational wording ("${noise.trim()}")`);
  }

  // ── Keyword match ──
  if (input.keywords) {
    const kws = input.keywords
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((k) => k.length >= 3);
    if (kws.length && kws.some((k) => haystack.includes(k))) {
      score += 8;
      reasons.push("Matched your search terms");
    }
  }

  // Job-title-only wording in the title is a strong negative even without a full
  // hard-reject phrase (e.g. "Occupational Health Nurse — City of X").
  if (/\b(nurse|technician|coordinator|assistant|director|manager)\b/.test(titleNorm) && !hasProcurement) {
    score -= 18;
    reasons.push("Excluded from top ranking due to job-title wording");
  }

  score = Math.max(0, Math.min(100, score));

  // A result with no service relevance at all is not useful to Occu-Med.
  const reject = !hasService && !hasPrime;

  return {
    score,
    reasons,
    rejected: reject,
    rejectReason: reject ? "No Occu-Med service relevance detected" : null,
    category: serviceCategory,
    publishedDate,
    stale,
  };
}

function rejected(reason: string, _haystack: string, input: RelevanceInput): RelevanceResult {
  return {
    score: 0,
    reasons: [reason],
    rejected: true,
    rejectReason: reason,
    category: null,
    publishedDate: parseResultDate(input.date ?? null),
    stale: false,
  };
}

/**
 * Lightweight pre-filter used before expensive AI extraction: keep only
 * candidates that have BOTH a procurement signal and a service signal and are
 * not obvious junk. Mirrors classifyResult but cheap and binary.
 */
export function isRfpCandidate(title: string, snippet: string, url?: string): boolean {
  if (isBlockedDomain(url)) return false;
  const haystack = norm(`${title} ${snippet}`);
  if (hasAny(haystack, HARD_REJECT_TERMS)) return false;
  const hasProcurement = hasAny(haystack, PROCUREMENT_SIGNALS);
  const hasService = hasAny(haystack, ALL_SERVICE_TERMS) || hasAny(haystack, PRIME_CONTRACTOR_SIGNALS);
  return hasProcurement && hasService;
}

/**
 * Convenience wrapper for the read-time list filter. Returns whether a stored
 * opportunity should be displayed, using the same term lists as write-time.
 */
export function passesQualityFilter(opp: {
  title?: string | null;
  description?: string | null;
  samUrl?: string | null;
  sourceUrl?: string | null;
}): boolean {
  const title = opp.title ?? "";
  if (title.trim().length < 8) return false;
  const result = classifyResult({
    title,
    snippet: opp.description ?? "",
    url: opp.samUrl ?? opp.sourceUrl ?? null,
    // Stored opportunities are date-filtered separately; don't double-penalize.
    allowHistorical: true,
  });
  return !result.rejected;
}
