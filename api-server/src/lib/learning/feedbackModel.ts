/**
 * Feedback Learning Model
 *
 * Aggregates user grades on opportunities to build signal weights,
 * then uses those weights to compute a userConfidence score (0-100)
 * for any new or existing opportunity.
 *
 * Signal dimensions tracked:
 *   - agency           (exact match)
 *   - naicsCode        (exact match)
 *   - providerName     (exact match)
 *   - tags             (individual tag membership)
 *   - keywords         (title/description word overlap)
 *
 * Grade → weight mapping:
 *   excellent  → +2.0
 *   good       → +1.0
 *   poor       → -1.0
 *   spam       → -2.0
 */

import { db } from "@workspace/db";
import { opportunityFeedbackTable, opportunitiesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeedbackGrade = "excellent" | "good" | "poor" | "spam";

const GRADE_WEIGHT: Record<FeedbackGrade, number> = {
  excellent: 2.0,
  good:      1.0,
  poor:     -1.0,
  spam:     -2.0,
};

export interface SignalWeights {
  agencies:   Record<string, number>;
  naicsCodes: Record<string, number>;
  providers:  Record<string, number>;
  tags:       Record<string, number>;
  keywords:   Record<string, number>;
  totalGrades: number;
}

export interface OpportunityInput {
  id?: string;
  agency?: string | null;
  naicsCode?: string | null;
  providerName?: string | null;
  tags?: string | null;      // JSON array text
  title?: string | null;
  description?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));
}

const STOPWORDS = new Set([
  "that", "this", "with", "from", "have", "will", "been", "were", "they",
  "their", "when", "what", "your", "into", "than", "more", "over", "such",
  "also", "each", "some", "only", "which", "other", "about", "after",
  "shall", "must", "upon", "under", "above", "services", "service",
]);

function addWeight(map: Record<string, number>, key: string | null | undefined, weight: number) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + weight;
}

// ─── Build signal weights from all feedback ───────────────────────────────────

export async function buildSignalWeights(): Promise<SignalWeights> {
  const rows = await db.select().from(opportunityFeedbackTable);

  const weights: SignalWeights = {
    agencies:    {},
    naicsCodes:  {},
    providers:   {},
    tags:        {},
    keywords:    {},
    totalGrades: rows.length,
  };

  for (const row of rows) {
    const w = GRADE_WEIGHT[row.grade as FeedbackGrade] ?? 0;
    addWeight(weights.agencies,   row.agency,       w);
    addWeight(weights.naicsCodes, row.naicsCode,    w);
    addWeight(weights.providers,  row.providerName,  w);
    for (const tag of parseTags(row.tags)) {
      addWeight(weights.tags, tag.toLowerCase(), w);
    }
    // Note: we don\'t store title/description in feedback rows for storage efficiency,
    // so keyword weights come from re-scoring at query time.
  }

  return weights;
}

// ─── Score a single opportunity against signal weights ─────────────────────────

export function scoreOpportunity(opp: OpportunityInput, weights: SignalWeights): number {
  if (weights.totalGrades === 0) return 50; // No feedback yet — neutral score

  let score = 50; // Start at midpoint
  let signals = 0;

  // Agency signal
  if (opp.agency && weights.agencies[opp.agency] !== undefined) {
    score += weights.agencies[opp.agency] * 8;
    signals++;
  }

  // NAICS signal
  if (opp.naicsCode && weights.naicsCodes[opp.naicsCode] !== undefined) {
    score += weights.naicsCodes[opp.naicsCode] * 6;
    signals++;
  }

  // Provider signal
  if (opp.providerName && weights.providers[opp.providerName] !== undefined) {
    score += weights.providers[opp.providerName] * 4;
    signals++;
  }

  // Tag signals
  const tags = parseTags(opp.tags);
  for (const tag of tags) {
    const tw = weights.tags[tag.toLowerCase()];
    if (tw !== undefined) {
      score += tw * 3;
      signals++;
    }
  }

  // Keyword signals (title + description)
  const titleWords = extractKeywords(opp.title);
  const descWords = extractKeywords(opp.description);
  const words = [...new Set([...titleWords, ...descWords])];
  for (const word of words) {
    const kw = weights.keywords[word];
    if (kw !== undefined) {
      score += kw * 2;
      signals++;
    }
  }

  // Normalize: clamp to 0-100
  return Math.round(Math.min(100, Math.max(0, score)));
}

// ─── Submit a grade ────────────────────────────────────────────────────────────

export async function submitGrade(
  opportunityId: string,
  grade: FeedbackGrade,
  notes?: string
): Promise<void> {
  // Fetch the opportunity to denormalize signal fields
  const [opp] = await db
    .select()
    .from(opportunitiesTable)
    .where(eq(opportunitiesTable.id, opportunityId))
    .limit(1);

  if (!opp) throw new Error(`Opportunity ${opportunityId} not found`);

  const id = crypto.randomUUID();

  // Upsert feedback (one grade per opportunity — update if already graded)
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
        notes: notes ?? existing[0].notes,
        updatedAt: new Date(),
      })
      .where(eq(opportunityFeedbackTable.opportunityId, opportunityId));
  } else {
    await db.insert(opportunityFeedbackTable).values({
      id,
      opportunityId,
      grade: grade as any,
      notes: notes ?? null,
      agency:       opp.agency ?? null,
      naicsCode:    opp.naicsCode ?? null,
      providerName: opp.providerName ?? null,
      tags:         opp.tags ?? null,
    });
  }

  // Update the opportunity\'s userGrade immediately
  await db
    .update(opportunitiesTable)
    .set({ userGrade: grade, updatedAt: new Date() })
    .where(eq(opportunitiesTable.id, opportunityId));

  // Rebuild weights and re-score ALL ungraded opportunities in the background
  setImmediate(async () => {
    try {
      await reScoreAllOpportunities();
    } catch (err) {
      console.error("[feedbackModel] background re-score failed:", err);
    }
  });
}

// ─── Re-score all opportunities ────────────────────────────────────────────────

export async function reScoreAllOpportunities(): Promise<void> {
  const weights = await buildSignalWeights();
  if (weights.totalGrades === 0) return;

  // Fetch all opportunities in batches
  const BATCH = 100;
  let offset = 0;

  while (true) {
    const batch = await db
      .select()
      .from(opportunitiesTable)
      .limit(BATCH)
      .offset(offset);

    if (batch.length === 0) break;

    for (const opp of batch) {
      const newScore = scoreOpportunity(
        {
          id:           opp.id,
          agency:       opp.agency,
          naicsCode:    opp.naicsCode,
          providerName: opp.providerName,
          tags:         opp.tags,
          title:        opp.title,
          description:  opp.description,
        },
        weights
      );

      await db
        .update(opportunitiesTable)
        .set({ userConfidence: String(newScore), updatedAt: new Date() })
        .where(eq(opportunitiesTable.id, opp.id));
    }

    offset += BATCH;
    if (batch.length < BATCH) break;
  }
}

// ─── Get feedback for one opportunity ─────────────────────────────────────────

export async function getFeedbackForOpportunity(opportunityId: string) {
  const rows = await db
    .select()
    .from(opportunityFeedbackTable)
    .where(eq(opportunityFeedbackTable.opportunityId, opportunityId))
    .limit(1);

  return rows[0] ?? null;
}

// ─── Get model summary (for the settings/debug view) ──────────────────────────

export async function getModelSummary() {
  const weights = await buildSignalWeights();
  return {
    totalGrades:       weights.totalGrades,
    topAgencies:       topN(weights.agencies, 5),
    topNaics:          topN(weights.naicsCodes, 5),
    topProviders:      topN(weights.providers, 5),
    topTags:           topN(weights.tags, 10),
    topKeywords:       topN(weights.keywords, 10),
  };
}

function topN(map: Record<string, number>, n: number) {
  return Object.entries(map)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, n)
    .map(([key, weight]) => ({ key, weight: Math.round(weight * 100) / 100 }));
}
