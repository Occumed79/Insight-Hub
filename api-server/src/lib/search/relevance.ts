/** Shared Occu-Med opportunity relevance engine powered by the procurement ontology. */
import {
  ALL_SERVICE_TERMS,
  BUYER_SECTOR_SIGNALS,
  CONDITIONAL_NEGATIVE_GROUPS,
  HARD_REJECT_TERMS,
  PROCUREMENT_SIGNALS,
  REASON_CODES,
  REGULATORY_STANDARDS_TERMS,
  SERVICE_CATEGORIES,
  WORKFORCE_SIGNALS,
} from "./occumedProcurementOntology";

export { HARD_REJECT_TERMS, PROCUREMENT_SIGNALS, SERVICE_CATEGORIES };
export const CURRENT_YEAR = new Date().getFullYear();
export const BLOCKED_DOMAINS = [
  "indeed.com",
  "linkedin.com",
  "ziprecruiter.com",
  "glassdoor.com",
  "talent.com",
  "monster.com",
  "careerbuilder.com",
  "simplyhired.com",
  "snagajob.com",
  "dice.com",
  "lensa.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "reddit.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  "wikipedia.org",
  "britannica.com",
  "webmd.com",
  "healthline.com",
  "mayoclinic.org",
  "wikihow.com",
];
export const SOFT_PENALTY_TERMS = [
  "news",
  "press release",
  "blog",
  "article",
  "webinar",
  "podcast",
  "definition",
  "what is",
  "how to",
  "guide to",
  "overview of",
];
const PROCUREMENT_DOMAINS = [
  ".gov",
  "sam.gov",
  "demandstar.com",
  "bidsync.com",
  "bidnet.com",
  "publicpurchase.com",
  "bonfirehub.com",
  "planetbids.com",
  "ionwave.net",
  "periscopeholdings.com",
  "grants.gov",
  "merx.com",
  "govwin.com",
];
const PRIME_CONTRACTOR_SIGNALS = BUYER_SECTOR_SIGNALS.flatMap(
  (s) => s.phrases,
).concat([
  "logcap",
  "afcap",
  "v2x",
  "amentum",
  "kbr",
  "fluor",
  "pae",
  "vectrus",
  "dyncorp",
  "leidos",
  "qtc",
  "international sos",
  "workcare",
  "concentra",
  "premise health",
  "prime contractor",
  "subcontractor",
  "teaming partner",
]);

function norm(s: string | null | undefined): string {
  return ` ${(s ?? "").toLowerCase().replace(/[\s\n\r]+/g, " ")} `;
}
function uniq(a: string[]): string[] {
  return Array.from(new Set(a));
}
function matchTerms(h: string, terms: string[]): string[] {
  return uniq(terms.filter((t) => h.includes(t.toLowerCase())));
}
function firstMatch(h: string, terms: string[]): string | null {
  return matchTerms(h, terms)[0] ?? null;
}
function hasAny(h: string, terms: string[]): boolean {
  return matchTerms(h, terms).length > 0;
}
export function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return null;
  }
}
export function isBlockedDomain(url: string | null | undefined): boolean {
  const host = hostFromUrl(url);
  return (
    !!host && BLOCKED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
  );
}
export function parseResultDate(
  raw: string | Date | null | undefined,
): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const s = raw.trim().toLowerCase();
  const rel = s.match(/(\d+)\s+(hour|day|week|month|year)s?\s+ago/);
  if (rel) {
    const d = new Date();
    const n = +rel[1];
    const u = rel[2];
    if (u === "hour") d.setHours(d.getHours() - n);
    else if (u === "day") d.setDate(d.getDate() - n);
    else if (u === "week") d.setDate(d.getDate() - 7 * n);
    else if (u === "month") d.setMonth(d.getMonth() - n);
    else d.setFullYear(d.getFullYear() - n);
    return d;
  }
  if (/(yesterday|today|hours? ago|minutes? ago)/.test(s)) return new Date();
  const p = new Date(raw);
  return !Number.isNaN(p.getTime()) &&
    p.getFullYear() >= 2000 &&
    p.getFullYear() <= CURRENT_YEAR + 2
    ? p
    : null;
}

export interface RelevanceInput {
  title?: string | null;
  snippet?: string | null;
  description?: string | null;
  url?: string | null;
  date?: string | Date | null;
  deadlineInFuture?: boolean;
  keywords?: string | null;
  allowHistorical?: boolean;
}
export type RelevanceConfidence =
  | "verified_explicit"
  | "strong_combination"
  | "possible_adjacent"
  | "insufficient"
  | "rejected";
export interface RelevanceResult {
  score: number;
  reasons: string[];
  rejected: boolean;
  rejectReason: string | null;
  category: string | null;
  publishedDate: Date | null;
  stale: boolean;
  primaryServiceCategory: string | null;
  matchedServiceCategories: string[];
  matchedExplicitPhrases: string[];
  matchedComponentTerms: string[];
  matchedProcurementSignals: string[];
  matchedWorkforceSignals: string[];
  matchedRegulatorySignals: string[];
  negativeSignals: string[];
  reasonCodes: string[];
  confidence: RelevanceConfidence;
}

function rejected(
  reason: string,
  input: RelevanceInput,
  reasonCodes = [REASON_CODES.hardReject],
  extras: Partial<RelevanceResult> = {},
): RelevanceResult {
  return {
    score: 0,
    reasons: [reason],
    rejected: true,
    rejectReason: reason,
    category: null,
    publishedDate: parseResultDate(input.date ?? null),
    stale: false,
    primaryServiceCategory: null,
    matchedServiceCategories: [],
    matchedExplicitPhrases: [],
    matchedComponentTerms: [],
    matchedProcurementSignals: [],
    matchedWorkforceSignals: [],
    matchedRegulatorySignals: [],
    negativeSignals: [],
    reasonCodes,
    confidence: "rejected",
    ...extras,
  };
}

export function classifyResult(input: RelevanceInput): RelevanceResult {
  const haystack = norm(
    [input.title, input.snippet, input.description].filter(Boolean).join(" "),
  );
  const titleNorm = norm(input.title);
  const reasons: string[] = [];
  const reasonCodes: string[] = [];
  if (isBlockedDomain(input.url))
    return rejected("Excluded: job board / non-procurement domain", input);
  const hard = firstMatch(haystack, HARD_REJECT_TERMS);
  if (hard)
    return rejected(
      `Excluded due to non-biddable/job/off-topic wording ("${hard.trim()}")`,
      input,
      [REASON_CODES.hardReject],
      { negativeSignals: [hard] },
    );
  const matchedProcurementSignals = matchTerms(haystack, PROCUREMENT_SIGNALS);
  const matchedWorkforceSignals = matchTerms(haystack, WORKFORCE_SIGNALS);
  const matchedRegulatorySignals = matchTerms(
    haystack,
    REGULATORY_STANDARDS_TERMS,
  );
  const matchedExplicitPhrases: string[] = [];
  const matchedComponentTerms: string[] = [];
  const matchedServiceCategories: string[] = [];
  let adjacentOnly = false;
  for (const c of SERVICE_CATEGORIES) {
    const ex = matchTerms(
      haystack,
      c.explicitPhrases.concat(c.highIntentPhrases ?? []),
    );
    const comp = matchTerms(
      haystack,
      c.componentTerms.concat(c.supportingTerms ?? []),
    );
    const reg = matchTerms(haystack, c.regulatoryTerms ?? []);
    if (ex.length || comp.length || reg.length) {
      matchedServiceCategories.push(c.label);
      matchedExplicitPhrases.push(...ex);
      matchedComponentTerms.push(...comp);
      matchedRegulatorySignals.push(...reg);
      if (c.adjacentOnly) adjacentOnly = true;
    }
  }
  const negativeSignals: string[] = [];
  let conditionalPenalty = 0;
  for (const g of CONDITIONAL_NEGATIVE_GROUPS) {
    const neg = matchTerms(haystack, g.terms);
    if (neg.length && !hasAny(haystack, g.requiresOneOf)) {
      negativeSignals.push(`${g.id}: ${neg.join(", ")}`);
      conditionalPenalty +=
        g.id === "incidental_requirement" ||
        g.id === "employee_benefits" ||
        g.id === "background_only"
          ? 45
          : 25;
      reasonCodes.push(REASON_CODES.negative);
    }
  }
  const hasProc = matchedProcurementSignals.length > 0;
  const explicit =
    matchedExplicitPhrases.filter(
      (p) =>
        !SERVICE_CATEGORIES.find(
          (c) => c.id === "adjacent_bundled",
        )?.componentTerms.includes(p),
    ).length > 0;
  const componentCount = uniq(
    matchedComponentTerms.filter(
      (t) =>
        !SERVICE_CATEGORIES.find(
          (c) => c.id === "adjacent_bundled",
        )?.componentTerms.includes(t),
    ),
  ).length;
  const hasWorkOrReg =
    matchedWorkforceSignals.length > 0 || matchedRegulatorySignals.length > 0;
  const hasNetwork = matchedServiceCategories.includes(
    "Provider network / program management / reporting",
  );
  const regulatoryProgram =
    (hasAny(haystack, ["medical surveillance"]) &&
      hasAny(haystack, ["lead", "asbestos", "silica"])) ||
    (hasAny(haystack, ["hearing conservation"]) &&
      hasAny(haystack, ["audiometric testing", "audiogram"])) ||
    (hasAny(haystack, ["respiratory protection", "respirator"]) &&
      hasAny(haystack, [
        "medical evaluation",
        "medical clearance",
        "fit testing",
      ])) ||
    (hasAny(haystack, ["NFPA 1582"]) &&
      hasAny(haystack, ["medical examination", "physical"])) ||
    (hasAny(haystack, ["DOT Part 40", "49 CFR Part 40"]) &&
      hasAny(haystack, ["collection", "MRO", "BAT"])) ||
    (hasAny(haystack, ["CENTCOM"]) &&
      hasAny(haystack, ["medical screening", "vaccination"])) ||
    (hasAny(haystack, ["essential job functions"]) &&
      hasAny(haystack, ["medical examination", "medical evaluation"]));
  
  // Require explicit medical terms in title for pathB (component-based matching)
  // This prevents false positives from general procurement terms
  const titleHasMedical = hasAny(titleNorm, [
    "medical", "health", "physical", "examination", "screening",
    "surveillance", "occupational", "wellness", "clinic", "drug", "audiometric",
    "respiratory", "hearing", "vision", "immunization", "vaccination",
    "physiologic", "vascular", "fit test"
  ]);
  
  const pathA = hasProc && explicit;
  const pathB = hasProc && componentCount >= 2 && hasWorkOrReg;
  const pathC = hasProc && regulatoryProgram;
  const pathD =
    hasProc &&
    hasNetwork &&
    titleHasMedical &&
    hasAny(haystack, [
      "medical examination",
      "surveillance",
      "testing",
      "occupational health",
      "deployment",
      "drug testing",
      "physical",
    ]);
  
  const pathBStrict = hasProc && componentCount >= 2 && hasWorkOrReg && titleHasMedical;
  
  const pathE =
    hasProc &&
    hasAny(titleNorm, [
      "wellness clinic",
      "medical services",
      "health-unit services",
      "screening services",
      "professional medical services",
    ]) &&
    (explicit || pathBStrict || pathC || pathD);
  
  const accepted =
    (pathA || pathBStrict || pathC || pathD || pathE) && conditionalPenalty < 40;
  if (pathA) {
    reasons.push("Explicit Occu-Med service phrase with procurement signal");
    reasonCodes.push(REASON_CODES.explicit);
  }
  if (pathBStrict) {
    reasons.push(
      "Multiple compatible medical/test components with workforce or regulatory context and medical title",
    );
    reasonCodes.push(REASON_CODES.component);
  }
  if (pathC) {
    reasons.push("High-specificity regulatory/program combination");
    reasonCodes.push(REASON_CODES.regulatory);
  }
  if (pathD) {
    reasons.push(
      "Managed delivery/network scope with medical service evidence",
    );
    reasonCodes.push(REASON_CODES.network);
  }
  if (pathE) {
    reasons.push(
      "Generic title accepted because scope contains Occu-Med service evidence",
    );
    reasonCodes.push(REASON_CODES.genericScope);
  }
  if (hasProc && !explicit && componentCount === 0) {
    reasons.push("Procurement wording alone is not Occu-Med relevance");
    reasonCodes.push(REASON_CODES.procurementOnly);
  }
  let score = pathA
    ? 82
    : pathC
      ? 80
      : pathBStrict
        ? 74
        : pathD
          ? 72
          : pathE
            ? 76
            : hasProc && componentCount > 0
              ? 48
              : explicit
                ? 55
                : 20;
  if (matchedWorkforceSignals.length) score += 5;
  if (matchedRegulatorySignals.length) score += 5;
  if (input.deadlineInFuture) score += 8;
  if (hasAny(haystack, PRIME_CONTRACTOR_SIGNALS)) score += 6;
  if (adjacentOnly && !explicit && componentCount < 2) score -= 25;
  const host = hostFromUrl(input.url);
  if (
    host &&
    PROCUREMENT_DOMAINS.some(
      (d) => host === d.replace(/^\./, "") || host.endsWith(d),
    )
  )
    reasons.push(
      "Procurement/government source noted but not sufficient by itself",
    );
  const publishedDate = parseResultDate(input.date ?? null);
  let stale = false;
  if (publishedDate) {
    const y = publishedDate.getFullYear();
    if (y < CURRENT_YEAR - 1 && !input.allowHistorical) {
      stale = true;
      score -= 15;
      reasons.push(`Older result (${y}) ranked down`);
    }
  } else {
    score -= 3;
    reasons.push("Date unknown");
  }
  const noise = firstMatch(haystack, SOFT_PENALTY_TERMS);
  if (noise && !hasProc) {
    score -= 12;
    reasons.push(`Lower priority informational wording ("${noise.trim()}")`);
  }
  if (
    /\b(nurse|technician|coordinator|assistant|director|manager)\b/.test(
      titleNorm,
    ) &&
    !hasProc
  ) {
    score -= 30;
    reasons.push("Job-title wording without procurement signal");
  }
  score = Math.max(0, Math.min(100, score - conditionalPenalty));
  const confidence: RelevanceConfidence = !accepted
    ? score >= 40
      ? "insufficient"
      : "rejected"
    : pathA
      ? "verified_explicit"
      : adjacentOnly
        ? "possible_adjacent"
        : "strong_combination";
  return {
    score,
    reasons,
    rejected: !accepted,
    rejectReason: accepted
      ? null
      : negativeSignals.length
        ? "Conditional false-positive rule failed"
        : "Insufficient Occu-Med service evidence with procurement signal",
    category: matchedServiceCategories[0] ?? null,
    publishedDate,
    stale,
    primaryServiceCategory: matchedServiceCategories[0] ?? null,
    matchedServiceCategories: uniq(matchedServiceCategories),
    matchedExplicitPhrases: uniq(matchedExplicitPhrases),
    matchedComponentTerms: uniq(matchedComponentTerms),
    matchedProcurementSignals: uniq(matchedProcurementSignals),
    matchedWorkforceSignals: uniq(matchedWorkforceSignals),
    matchedRegulatorySignals: uniq(matchedRegulatorySignals),
    negativeSignals: uniq(negativeSignals),
    reasonCodes: uniq(reasonCodes),
    confidence,
  };
}
export function isRfpCandidate(
  title: string,
  snippet: string,
  url?: string,
): boolean {
  if (isBlockedDomain(url)) return false;
  const r = classifyResult({ title, snippet, url, allowHistorical: true });
  return !r.rejected && r.matchedProcurementSignals.length > 0;
}
export function passesQualityFilter(opp: {
  title?: string | null;
  description?: string | null;
  samUrl?: string | null;
  sourceUrl?: string | null;
}): boolean {
  const title = opp.title ?? "";
  if (title.trim().length < 8) return false;
  return !classifyResult({
    title,
    snippet: opp.description ?? "",
    url: opp.samUrl ?? opp.sourceUrl ?? null,
    allowHistorical: true,
  }).rejected;
}
