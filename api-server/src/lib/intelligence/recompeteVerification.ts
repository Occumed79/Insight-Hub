import { createHash } from "node:crypto";

const USA_SPENDING_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const SAM_CONTRACT_AWARDS_URL = "https://api.sam.gov/contract-awards/v1/search";
const REQUEST_TIMEOUT_MS = 14_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

export interface RecompeteVerificationInput {
  id: string;
  title: string;
  agency: string;
  naics?: string | null;
  incumbentName?: string | null;
}

export interface RecompeteEvidence {
  source: "USAspending" | "SAM Contract Awards";
  awardId: string | null;
  recipientName: string | null;
  agency: string | null;
  description: string | null;
  amount: number | null;
  startDate: string | null;
  endDate: string | null;
  naics: string | null;
  sourceUrl: string | null;
  matchScore: number;
}

export interface RecompeteVerificationResult {
  confidence: "verified" | "high" | "medium" | "unverified";
  confidenceScore: number;
  summary: string;
  evidence: RecompeteEvidence[];
  sourcesChecked: Array<{
    source: "USAspending" | "SAM Contract Awards";
    status: "matched" | "no_match" | "unavailable";
    detail?: string;
  }>;
  verifiedAt: string;
  cached?: boolean;
}

const cache = new Map<string, { expiresAt: number; value: RecompeteVerificationResult }>();

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function atPath(record: JsonRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => asRecord(value)[key], record);
}

function firstPathString(record: JsonRecord, paths: string[]): string | null {
  for (const path of paths) {
    const value = asString(atPath(record, path));
    if (value) return value;
  }
  return null;
}

function firstPathNumber(record: JsonRecord, paths: string[]): number | null {
  for (const path of paths) {
    const value = asNumber(atPath(record, path));
    if (value !== null) return value;
  }
  return null;
}

function normalizedWords(value: string | null | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|pllc|lp)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

function textSimilarity(left: string | null | undefined, right: string | null | undefined): number {
  const leftWords = new Set(normalizedWords(left));
  const rightWords = new Set(normalizedWords(right));
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  let intersection = 0;
  for (const word of leftWords) if (rightWords.has(word)) intersection += 1;
  return intersection / Math.max(leftWords.size, rightWords.size);
}

function evidenceMatchScore(input: RecompeteVerificationInput, evidence: Omit<RecompeteEvidence, "matchScore">): number {
  let score = 0;
  const incumbentSimilarity = textSimilarity(input.incumbentName, evidence.recipientName);
  const agencySimilarity = textSimilarity(input.agency, evidence.agency);
  const titleSimilarity = textSimilarity(input.title, evidence.description);
  score += incumbentSimilarity * 65;
  score += agencySimilarity * 20;
  score += titleSimilarity * 10;
  if (input.naics && evidence.naics && (input.naics === evidence.naics || evidence.naics.startsWith(input.naics))) score += 5;
  return Math.round(Math.min(100, score));
}

function cacheKey(input: RecompeteVerificationInput): string {
  return createHash("sha256")
    .update(`${input.id}|${input.title}|${input.agency}|${input.naics ?? ""}|${input.incumbentName ?? ""}`)
    .digest("hex");
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchWithTimeout(url: string | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function queryUsaSpending(input: RecompeteVerificationInput): Promise<RecompeteEvidence[]> {
  const start = new Date();
  start.setFullYear(start.getFullYear() - 10);
  const end = new Date();

  const filters: JsonRecord = {
    award_type_codes: ["A", "B", "C", "D"],
    time_period: [{ start_date: dateString(start), end_date: dateString(end), date_type: "date_signed" }],
  };
  if (input.incumbentName?.trim()) filters.recipient_search_text = [input.incumbentName.trim()];
  else filters.keywords = [input.title.slice(0, 160)];
  if (input.naics && /^\d{6}$/.test(input.naics)) filters.naics_codes = [input.naics];

  const response = await fetchWithTimeout(USA_SPENDING_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      filters,
      fields: [
        "Award ID",
        "Recipient Name",
        "Description",
        "Award Amount",
        "Start Date",
        "End Date",
        "Awarding Agency",
        "Awarding Sub Agency",
        "NAICS Code",
        "generated_internal_id",
      ],
      sort: "End Date",
      order: "desc",
      limit: 10,
      page: 1,
    }),
  });
  if (!response.ok) throw new Error(`USAspending returned ${response.status}`);

  const payload = asRecord(await response.json());
  const results = Array.isArray(payload.results) ? payload.results : [];
  return results.map((rawValue) => {
    const raw = asRecord(rawValue);
    const generatedId = asString(raw.generated_internal_id);
    const base: Omit<RecompeteEvidence, "matchScore"> = {
      source: "USAspending",
      awardId: asString(raw["Award ID"] ?? raw.award_id),
      recipientName: asString(raw["Recipient Name"] ?? raw.recipient_name),
      agency: asString(raw["Awarding Agency"] ?? raw.awarding_agency_name),
      description: asString(raw.Description ?? raw.description),
      amount: asNumber(raw["Award Amount"] ?? raw.total_obligation),
      startDate: asString(raw["Start Date"] ?? raw.period_of_performance_start_date),
      endDate: asString(raw["End Date"] ?? raw.period_of_performance_current_end_date),
      naics: asString(raw["NAICS Code"] ?? raw.naics_code),
      sourceUrl: generatedId ? `https://www.usaspending.gov/award/${generatedId}` : null,
    };
    return { ...base, matchScore: evidenceMatchScore(input, base) };
  });
}

async function querySamContractAwards(input: RecompeteVerificationInput): Promise<RecompeteEvidence[]> {
  const apiKey = process.env.SAM_GOV_API_KEY?.trim();
  if (!apiKey) throw new Error("SAM_GOV_API_KEY is not configured");
  if (!input.incumbentName?.trim()) return [];

  const url = new URL(SAM_CONTRACT_AWARDS_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("awardeeLegalBusinessName", input.incumbentName.trim().slice(0, 120));
  url.searchParams.set("awardOrIDV", "Award");
  url.searchParams.set("modificationNumber", "0");
  url.searchParams.set("limit", "10");
  url.searchParams.set("offset", "0");
  url.searchParams.set("includeSections", "contractId,coreData,awardDetails,awardeeData");
  if (input.naics && /^\d{6}$/.test(input.naics)) url.searchParams.set("naicsCode", input.naics);

  const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
  if (response.status === 204) return [];
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    throw new Error(`SAM Contract Awards returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const payload = asRecord(await response.json());
  const awards = Array.isArray(payload.awardSummary) ? payload.awardSummary : [];
  return awards.map((rawValue) => {
    const raw = asRecord(rawValue);
    const piid = firstPathString(raw, ["contractId.piid"]);
    const base: Omit<RecompeteEvidence, "matchScore"> = {
      source: "SAM Contract Awards",
      awardId: piid,
      recipientName: firstPathString(raw, [
        "awardDetails.awardeeData.awardeeHeader.legalBusinessName",
        "awardDetails.awardeeData.awardeeHeader.awardeeName",
        "awardDetails.awardeeData.awardeeHeader.awardeeNameFromContract",
      ]),
      agency: firstPathString(raw, [
        "coreData.federalOrganization.contractingInformation.contractingDepartment.name",
        "coreData.federalOrganization.contractingInformation.contractingSubtier.name",
        "contractId.subtier.name",
      ]),
      description: firstPathString(raw, ["awardDetails.productOrServiceInformation.descriptionOfContractRequirement"]),
      amount: firstPathNumber(raw, [
        "awardDetails.totalContractDollars.totalBaseAndAllOptionsValue",
        "awardDetails.totalContractDollars.totalActionObligation",
        "awardDetails.dollars.baseAndAllOptionsValue",
      ]),
      startDate: firstPathString(raw, ["awardDetails.dates.periodOfPerformanceStartDate", "awardDetails.dates.dateSigned"]),
      endDate: firstPathString(raw, ["awardDetails.dates.currentCompletionDate", "awardDetails.dates.ultimateCompletionDate"]),
      naics: firstPathString(raw, ["awardDetails.productOrServiceInformation.idvNAICS.code"]),
      sourceUrl: piid ? `https://sam.gov/search/?index=fpds&keywords=${encodeURIComponent(piid)}` : null,
    };
    return { ...base, matchScore: evidenceMatchScore(input, base) };
  });
}

export async function verifyRecompete(input: RecompeteVerificationInput): Promise<RecompeteVerificationResult> {
  const key = cacheKey(input);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cached: true };

  const [usaResult, samResult] = await Promise.allSettled([
    queryUsaSpending(input),
    querySamContractAwards(input),
  ]);

  const usaEvidence = usaResult.status === "fulfilled" ? usaResult.value : [];
  const samEvidence = samResult.status === "fulfilled" ? samResult.value : [];
  const evidence = [...samEvidence, ...usaEvidence]
    .filter((item) => item.matchScore >= 25)
    .sort((left, right) => right.matchScore - left.matchScore)
    .slice(0, 8);

  const bestSam = samEvidence[0]?.matchScore ?? 0;
  const bestUsa = usaEvidence[0]?.matchScore ?? 0;
  let confidence: RecompeteVerificationResult["confidence"] = "unverified";
  let confidenceScore = Math.max(bestSam, bestUsa);
  if (bestSam >= 75 && bestUsa >= 65) {
    confidence = "verified";
    confidenceScore = Math.min(100, Math.round((bestSam + bestUsa) / 2 + 8));
  } else if (Math.max(bestSam, bestUsa) >= 75) {
    confidence = "high";
  } else if (Math.max(bestSam, bestUsa) >= 45) {
    confidence = "medium";
  }

  const sourcesChecked: RecompeteVerificationResult["sourcesChecked"] = [
    {
      source: "USAspending",
      status: usaResult.status === "rejected" ? "unavailable" : usaEvidence.length > 0 ? "matched" : "no_match",
      detail: usaResult.status === "rejected" ? String(usaResult.reason instanceof Error ? usaResult.reason.message : usaResult.reason) : undefined,
    },
    {
      source: "SAM Contract Awards",
      status: samResult.status === "rejected" ? "unavailable" : samEvidence.length > 0 ? "matched" : "no_match",
      detail: samResult.status === "rejected" ? String(samResult.reason instanceof Error ? samResult.reason.message : samResult.reason) : undefined,
    },
  ];

  const summary =
    confidence === "verified"
      ? "The incumbent position is corroborated by both SAM Contract Awards and USAspending records."
      : confidence === "high"
        ? "An official federal award source strongly supports the published incumbent position."
        : confidence === "medium"
          ? "Official award data provides a possible match, but the incumbent position is not fully corroborated."
          : "No sufficiently strong official award match was found. Treat the published incumbent as unverified.";

  const value: RecompeteVerificationResult = {
    confidence,
    confidenceScore,
    summary,
    evidence,
    sourcesChecked,
    verifiedAt: new Date().toISOString(),
  };
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
