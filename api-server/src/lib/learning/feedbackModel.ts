/**
 * Feedback Learning Model
 *
 * Aggregates user grades on opportunities to build signal weights, then uses
 * scope/content signals to compute a userConfidence score (0-100).
 *
 * Provider weights are retained for diagnostics only. They intentionally do
 * NOT contribute to opportunity relevance: one bad result from Tango, SAM,
 * Serper, etc. must not teach the system that unrelated records from that
 * provider are intrinsically bad.
 */

import { rfpDb as db } from "@workspace/db";
import {
  opportunityFeedbackTable,
  opportunitiesTable,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

export type FeedbackGrade = "excellent" | "good" | "poor" | "spam";

const GRADE_WEIGHT: Record<FeedbackGrade, number> = {
  excellent: 2.0,
  good: 1.0,
  poor: -1.0,
  spam: -2.0,
};

export interface SignalWeights {
  agencies: Record<string, number>;
  naicsCodes: Record<string, number>;
  /** Diagnostic source-quality signal only; never used to score relevance. */
  providers: Record<string, number>;
  tags: Record<string, number>;
  keywords: Record<string, number>;
  totalGrades: number;
}

export interface OpportunityInput {
  id?: string;
  agency?: string | null;
  naicsCode?: string | null;
  providerName?: string | null;
  tags?: string | null;
  title?: string | null;
  description?: string | null;
}

const MAX_KEYWORDS_PER_ROW = 50;
const MAX_BOUNDED_CANDIDATES = 500;
const TOP_KEYWORD_SIGNALS = 5;

function parseTags(tagsText: string | null | undefined): string[] {
  if (!tagsText) return [];
  try {
    const parsed = JSON.parse(tagsText);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function extractKeywords(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
}

const STOPWORDS = new Set([
  "that",
  "this",
  "with",
  "from",
  "have",
  "will",
  "been",
  "were",
  "they",
  "their",
  "when",
  "what",
  "your",
  "into",
  "than",
  "more",
  "over",
  "such",
  "also",
  "each",
  "some",
  "only",
  "which",
  "other",
  "about",
  "after",
  "shall",
  "must",
  "upon",
  "under",
  "above",
  "services",
  "service",
]);

function addWeight(
  map: Record<string, number>,
  key: string | null | undefined,
  weight: number,
) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + weight;
}

export async function buildSignalWeights(): Promise<SignalWeights> {
  const rows = await db.select().from(opportunityFeedbackTable);

  const weights: SignalWeights = {
    agencies: {},
    naicsCodes: {},
    providers: {},
    tags: {},
    keywords: {},
    totalGrades: rows.length,
  };

  for (const row of rows) {
    const weight = GRADE_WEIGHT[row.grade as FeedbackGrade] ?? 0;
    addWeight(weights.agencies, row.agency, weight);
    addWeight(weights.naicsCodes, row.naicsCode, weight);
    // Retained only for source-quality diagnostics/model summary.
    addWeight(weights.providers, row.providerName, weight);
    for (const tag of parseTags(row.tags)) {
      addWeight(weights.tags, tag.toLowerCase(), weight);
    }

    const titleWords = extractKeywords(row.title);
    const descWords = extractKeywords(row.description);
    const seen = new Set<string>();
    let keywordCount = 0;

    for (const word of [...titleWords, ...descWords]) {
      if (seen.has(word)) continue;
      seen.add(word);
      addWeight(weights.keywords, word, weight);
      keywordCount += 1;
      if (keywordCount >= MAX_KEYWORDS_PER_ROW) break;
    }
  }

  return weights;
}

/**
 * Score relevance using buyer/scope/content signals only. Provider identity is
 * deliberately excluded so feedback cannot poison an entire source.
 */
export function scoreOpportunity(
  opp: OpportunityInput,
  weights: SignalWeights,
): number {
  if (weights.totalGrades === 0) return 50;

  let score = 50;

  if (opp.agency && weights.agencies[opp.agency] !== undefined) {
    score += weights.agencies[opp.agency] * 8;
  }

  if (opp.naicsCode && weights.naicsCodes[opp.naicsCode] !== undefined) {
    score += weights.naicsCodes[opp.naicsCode] * 6;
  }

  for (const tag of parseTags(opp.tags)) {
    const tagWeight = weights.tags[tag.toLowerCase()];
    if (tagWeight !== undefined) score += tagWeight * 3;
  }

  const words = [
    ...new Set([...extractKeywords(opp.title), ...extractKeywords(opp.description)]),
  ];
  for (const word of words) {
    const keywordWeight = weights.keywords[word];
    if (keywordWeight !== undefined) score += keywordWeight * 2;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

export async function submitGrade(
  opportunityId: string,
  grade: FeedbackGrade,
  notes?: string,
): Promise<void> {
  const [opp] = await db
    .select()
    .from(opportunitiesTable)
    .where(eq(opportunitiesTable.id, opportunityId))
    .limit(1);

  if (!opp) throw new Error(`Opportunity ${opportunityId} not found`);

  const id = crypto.randomUUID();
  const existing = await db
    .select()
    .from(opportunityFeedbackTable)
    .where(eq(opportunityFeedbackTable.opportunityId, opportunityId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(opportunityFeedbackTable)
      .set({
        grade: grade as any,
        notes: notes !== undefined ? notes : existing[0].notes,
        agency: opp.agency ?? null,
        naicsCode: opp.naicsCode ?? null,
        providerName: opp.providerName ?? null,
        tags: opp.tags ?? null,
        title: opp.title ?? null,
        description: opp.description ?? null,
        updatedAt: new Date(),
      })
      .where(eq(opportunityFeedbackTable.opportunityId, opportunityId));
  } else {
    await db.insert(opportunityFeedbackTable).values({
      id,
      opportunityId,
      grade: grade as any,
      notes: notes ?? null,
      agency: opp.agency ?? null,
      naicsCode: opp.naicsCode ?? null,
      providerName: opp.providerName ?? null,
      tags: opp.tags ?? null,
      title: opp.title ?? null,
      description: opp.description ?? null,
    });
  }

  await db
    .update(opportunitiesTable)
    .set({ userGrade: grade, updatedAt: new Date() })
    .where(eq(opportunitiesTable.id, opportunityId));

  try {
    await reScoreCandidates(opp, await buildSignalWeights());
  } catch (error) {
    console.error("[feedbackModel] bounded re-score failed:", error);
  }
}

// Re-score ungraded opportunities sharing a meaningful buyer/scope/content
// signal. Provider identity is intentionally NOT a candidate-expansion signal.
async function reScoreCandidates(
  graded: OpportunityInput & { id: string },
  weights: SignalWeights,
): Promise<number> {
  if (weights.totalGrades === 0) return 0;

  const gradedTags = parseTags(graded.tags).map((tag) => tag.toLowerCase());
  const titleKeywords = extractKeywords(graded.title).slice(0, TOP_KEYWORD_SIGNALS);

  const candidateRows = await db.execute<{
    id: string;
    agency: string | null;
    naics_code: string | null;
    provider_name: string | null;
    tags: string | null;
    title: string | null;
    description: string | null;
  }>(sql`
    SELECT id, agency, naics_code, provider_name, tags, title, description
    FROM opportunities
    WHERE (
      user_grade IS NULL
      AND (
        ${graded.agency ? sql`agency = ${graded.agency}` : sql`FALSE`}
        OR ${graded.naicsCode ? sql`naics_code = ${graded.naicsCode}` : sql`FALSE`}
        ${gradedTags.length > 0 ? sql`OR tags IS NOT NULL` : sql``}
        ${
          titleKeywords.length > 0
            ? sql`OR (title IS NOT NULL AND (${sql.join(
                titleKeywords.map(
                  (keyword) => sql`lower(title) LIKE ${`%${keyword}%`}`,
                ),
                sql` OR `,
              )}))`
            : sql``
        }
      )
    )
    OR id = ${graded.id}
    LIMIT ${MAX_BOUNDED_CANDIDATES}
  `);

  const rows = candidateRows.rows ?? (candidateRows as any);
  const gradedTagSet = new Set(gradedTags);
  const candidates = (Array.isArray(rows) ? rows : []).filter((row: any) => {
    if (row.id === graded.id) return true;
    if (row.user_grade) return false;
    if (gradedTagSet.size > 0) {
      const rowTags = parseTags(row.tags).map((tag: string) => tag.toLowerCase());
      if (rowTags.some((tag: string) => gradedTagSet.has(tag))) return true;
    }
    return true;
  });

  let updated = 0;
  for (const candidate of candidates) {
    const newScore = scoreOpportunity(
      {
        id: candidate.id,
        agency: candidate.agency,
        naicsCode: candidate.naics_code,
        providerName: candidate.provider_name,
        tags: candidate.tags,
        title: candidate.title,
        description: candidate.description,
      },
      weights,
    );

    await db
      .update(opportunitiesTable)
      .set({ userConfidence: String(newScore), updatedAt: new Date() })
      .where(eq(opportunitiesTable.id, candidate.id));
    updated += 1;
  }

  return updated;
}

export async function reScoreAllOpportunities(): Promise<{ updated: number }> {
  const weights = await buildSignalWeights();
  if (weights.totalGrades === 0) return { updated: 0 };

  const BATCH = 100;
  let cursor = "";
  let updated = 0;

  while (true) {
    const batchResult = await db.execute<{
      id: string;
      agency: string | null;
      naics_code: string | null;
      provider_name: string | null;
      tags: string | null;
      title: string | null;
      description: string | null;
    }>(sql`
      SELECT id, agency, naics_code, provider_name, tags, title, description
      FROM opportunities
      WHERE id > ${cursor}
      ORDER BY id ASC
      LIMIT ${BATCH}
    `);

    const batch = batchResult.rows ?? (batchResult as any);
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const opp of batch) {
      const newScore = scoreOpportunity(
        {
          id: opp.id,
          agency: opp.agency,
          naicsCode: opp.naics_code,
          providerName: opp.provider_name,
          tags: opp.tags,
          title: opp.title,
          description: opp.description,
        },
        weights,
      );

      await db
        .update(opportunitiesTable)
        .set({ userConfidence: String(newScore), updatedAt: new Date() })
        .where(eq(opportunitiesTable.id, opp.id));
      updated += 1;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH) break;
  }

  return { updated };
}

export async function getFeedbackForOpportunity(opportunityId: string) {
  const rows = await db
    .select()
    .from(opportunityFeedbackTable)
    .where(eq(opportunityFeedbackTable.opportunityId, opportunityId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getModelSummary() {
  const weights = await buildSignalWeights();
  return {
    totalGrades: weights.totalGrades,
    topAgencies: topN(weights.agencies, 5),
    topNaics: topN(weights.naicsCodes, 5),
    // Source telemetry is visible, but it does not change relevance scores.
    topProviders: topN(weights.providers, 5),
    providerSignalMode: "diagnostic-only" as const,
    topTags: topN(weights.tags, 10),
    topKeywords: topN(weights.keywords, 10),
  };
}

function topN(map: Record<string, number>, n: number) {
  return Object.entries(map)
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .slice(0, n)
    .map(([key, weight]) => ({
      key,
      weight: Math.round(weight * 100) / 100,
    }));
}
