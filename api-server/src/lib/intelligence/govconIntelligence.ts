import { embedTexts } from "../search/embeddings";
import { OCCUMED_SEMANTIC_PROFILE } from "../search/semanticRerank";

export type GovConIntelligenceMode = "forecast" | "recompete";

export interface GovConRankableRecord {
  id: string;
  title: string;
  agency: string;
  subAgency?: string | null;
  description?: string | null;
  naics?: string | null;
  setAside?: string | null;
  incumbentName?: string | null;
  isRecompete?: boolean;
}

export interface GovConRelevance {
  score: number;
  classification: "strong" | "possible" | "low";
  semanticSimilarity: number | null;
  provider: "gemini" | "deterministic";
  reasons: string[];
}

const POSITIVE_TERMS: Array<[string, number, string]> = [
  ["occupational health", 18, "Occupational-health requirement"],
  ["occupational medicine", 18, "Occupational-medicine requirement"],
  ["employee health", 14, "Employee-health program"],
  ["workforce care", 13, "Workforce-care requirement"],
  ["medical exam", 12, "Medical examinations"],
  ["physical exam", 12, "Physical examinations"],
  ["pre-employment", 11, "Pre-employment services"],
  ["fitness for duty", 11, "Fitness-for-duty services"],
  ["drug testing", 11, "Drug-testing services"],
  ["drug collection", 9, "Specimen collection"],
  ["medical surveillance", 13, "Medical-surveillance program"],
  ["audiogram", 10, "Audiometric testing"],
  ["hearing conservation", 10, "Hearing-conservation services"],
  ["spirometry", 10, "Pulmonary testing"],
  ["pulmonary function", 10, "Pulmonary-function testing"],
  ["respirator", 9, "Respirator-related services"],
  ["vaccination", 7, "Vaccination services"],
  ["immunization", 7, "Immunization services"],
  ["deployment medical", 14, "Deployment medical services"],
  ["clinic", 5, "Clinical-services signal"],
  ["laboratory", 4, "Laboratory-services signal"],
];

const NEGATIVE_TERMS: Array<[string, number]> = [
  ["starlink", 55],
  ["satellite", 35],
  ["software license", 35],
  ["information technology", 30],
  ["cybersecurity", 35],
  ["construction", 30],
  ["janitorial", 40],
  ["landscaping", 40],
  ["weapons", 45],
  ["ammunition", 45],
  ["vehicle maintenance", 35],
  ["food service", 35],
  ["veterinary", 35],
];

function normalizedText(record: GovConRankableRecord): string {
  return [
    record.title,
    record.agency,
    record.subAgency,
    record.description,
    record.naics,
    record.setAside,
    record.incumbentName,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12_000);
}

function deterministicScore(record: GovConRankableRecord, mode: GovConIntelligenceMode): {
  score: number;
  reasons: string[];
} {
  const text = normalizedText(record).toLowerCase();
  const reasons: string[] = [];
  let score = 10;

  if (record.naics?.startsWith("621")) {
    score += 30;
    reasons.push("Health-care NAICS 621");
  } else if (record.naics?.startsWith("5613")) {
    score += 17;
    reasons.push("Workforce-support NAICS");
  } else if (record.naics === "923120") {
    score += 20;
    reasons.push("Public-health administration NAICS");
  }

  for (const [term, weight, reason] of POSITIVE_TERMS) {
    if (!text.includes(term)) continue;
    score += weight;
    if (reasons.length < 5) reasons.push(reason);
  }

  for (const [term, penalty] of NEGATIVE_TERMS) {
    if (text.includes(term)) score -= penalty;
  }

  if (mode === "recompete" && (record.incumbentName || record.isRecompete)) {
    score += 8;
    reasons.push("Published recompete or incumbent signal");
  }

  return {
    score: Math.max(0, Math.min(70, score)),
    reasons: Array.from(new Set(reasons)).slice(0, 5),
  };
}

function cosine(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function classify(score: number): GovConRelevance["classification"] {
  if (score >= 68) return "strong";
  if (score >= 44) return "possible";
  return "low";
}

export async function rankGovConRecords<T extends GovConRankableRecord>(
  records: T[],
  mode: GovConIntelligenceMode,
  focus?: string,
): Promise<Array<T & { relevance: GovConRelevance }>> {
  if (records.length === 0) return [];

  const deterministic = records.map((record) => deterministicScore(record, mode));
  let similarities: number[] | null = null;

  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      const documentResult = await embedTexts(records.map(normalizedText), "document", "gemini");
      const profileText = [
        OCCUMED_SEMANTIC_PROFILE,
        mode === "recompete"
          ? "Prioritize expiring or incumbent federal contracts that Occu-Med could credibly compete for."
          : "Prioritize future procurements that Occu-Med could credibly perform.",
        focus?.trim() ? `Current user focus: ${focus.trim()}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const queryResult = await embedTexts([profileText], "query", "gemini");
      const queryVector = queryResult?.vectors[0];
      if (
        documentResult?.provider === "gemini" &&
        queryResult?.provider === "gemini" &&
        queryVector &&
        documentResult.vectors.length === records.length
      ) {
        similarities = documentResult.vectors.map((vector) =>
          Math.max(0, Math.min(1, cosine(queryVector, vector))),
        );
      }
    } catch {
      similarities = null;
    }
  }

  return records
    .map((record, index) => {
      const semanticSimilarity = similarities?.[index] ?? null;
      const semanticPoints = semanticSimilarity === null ? 0 : semanticSimilarity * 30;
      const score = Math.round(Math.max(0, Math.min(100, deterministic[index].score + semanticPoints)));
      const reasons = [...deterministic[index].reasons];
      if (semanticSimilarity !== null) {
        reasons.unshift(`Gemini semantic match ${Math.round(semanticSimilarity * 100)}%`);
      }
      return {
        ...record,
        relevance: {
          score,
          classification: classify(score),
          semanticSimilarity,
          provider: semanticSimilarity === null ? "deterministic" : "gemini",
          reasons: Array.from(new Set(reasons)).slice(0, 6),
        },
      };
    })
    .sort((left, right) => right.relevance.score - left.relevance.score);
}
