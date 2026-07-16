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
 *   - keywords         (title/description word overlap — extracted from
 *                       persisted feedback.title / feedback.description)
 *
 * Grade → weight mapping:
 *   excellent  → +2.0
 *   good       → +1.0
 *   poor       → -1.0
 *   spam       → -2.0
 */

import { db } from "@workspace/db";
import { opportunityFeedbackTable, opportunitiesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
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

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum unique keywords captured per feedback row during weight building. */
const MAX_KEYWORDS_PER_ROW = 50;

/** Maximum candidate opportunities re-scored after a single grade submission. */
const MAX_BOUNDED_CANDIDATES = 500;

/** Number of top keyword signals used to widen the candidate search. */
const TOP_KEYWORD_SIGNALS = 5;

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

    // Extract keywords from the persisted title and description on the feedback
    // row. Title keywords are included first; each keyword is counted at most
    // once per row so a repeated term in description doesn't double-count.
    const titleWords = extractKeywords(row.title);
    const descWords  = extractKeywords(row.description);
    const seen = new Set<string>();
    let keywordCount = 0;

    for (const word of [...titleWords, ...descWords]) {
      if (seen.has(word)) continue;
      seen.add(word);
      addWeight(weights.keywords, word, w);
      keywordCount++;
      if (keywordCount >= MAX_KEYWORDS_PER_ROW) break;
    }
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

  void signals; // tracked for future use

  // Normalize: clamp to 0-100
  return Math.round(Math.min(100, Math.max(0, score)));
}

// ─── Submit a grade ────────────────────────────────────────────────────────────

export async function submitGrade(
  opportunityId: string,
  grade: FeedbackGrade,
  notes?: string
): Promise<void> {
  // Fetch the opportunity to denormalize signal fields (always re-read so stale
  // values from a previous version of the record are never preserved).
  const [opp] = await db
    .select()
    .from(opportunitiesTable)
    .where(eq(opportunitiesTable.id, opportunityId))
    .limit(1);

  if (!opp) throw new Error(`Opportunity ${opportunityId} not found`);

  const id = crypto.randomUUID();

  // Upsert feedback — one grade per opportunity.
  // On UPDATE: refresh all denormalized signal fields so stale values from an
  // earlier version of the opportunity are never kept. Notes omitted by the
  // caller preserve the existing note; an explicit empty string clears it.
  const existing = await db
    .select()
    .from(opportunityFeedbackTable)
    .where(eq(opportunityFeedbackTable.opportunityId, opportunityId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(opportunityFeedbackTable)
      .set({
        grade:        grade as any,
        notes:        notes !== undefined ? notes : existing[0].notes,
        // Refresh all denormalized signal columns from the current opportunity
        agency:       opp.agency ?? null,
        naicsCode:    opp.naicsCode ?? null,
        providerName: opp.providerName ?? null,
        tags:         opp.tags ?? null,
        title:        opp.title ?? null,
        description:  opp.description ?? null,
        updatedAt:    new Date(),
      })
      .where(eq(opportunityFeedbackTable.opportunityId, opportunityId));
  } else {
    await db.insert(opportunityFeedbackTable).values({
      id,
      opportunityId,
      grade:        grade as any,
      notes:        notes ?? null,
      agency:       opp.agency ?? null,
      naicsCode:    opp.naicsCode ?? null,
      providerName: opp.providerName ?? null,
      tags:         opp.tags ?? null,
      title:        opp.title ?? null,
      description:  opp.description ?? null,
    });
  }

  // Update the opportunity's userGrade immediately.
  await db
    .update(opportunitiesTable)
    .set({ userGrade: grade, updatedAt: new Date() })
    .where(eq(opportunitiesTable.id, opportunityId));

  // Rebuild weights once, then re-score only a bounded set of candidates that
  // share at least one meaningful signal with the freshly graded opportunity.
  // This replaces the old setImmediate(reScoreAllOpportunities) call.
  try {
    await reScoreCandidates(opp, await buildSignalWeights());
  } catch (err) {
    console.error("[feedbackModel] bounded re-score failed:", err);
  }
}

// ─── Bounded candidate re-score ───────────────────────────────────────────────
//
// Re-scores only ungraded opportunities that share at least one of:
//   agency, NAICS code, provider, overlapping normalized tag, or one of the
//   top keyword signals derived from the graded opportunity's title.
// Always includes the graded opportunity itself so its userConfidence reflects
// the new model immediately.
// Maximum candidates: MAX_BOUNDED_CANDIDATES (500).

async function reScoreCandidates(
  graded: OpportunityInput & { id: string },
  weights: SignalWeights
): Promise<number> {
  if (weights.totalGrades === 0) return 0;

  // Collect normalized tags from the graded opportunity.
  const gradedTags = parseTags(graded.tags).map(t => t.toLowerCase());

  // Pick the strongest keyword signals extracted from this opportunity's title
  // to widen the candidate set without scanning the whole table.
  const titleKeywords = extractKeywords(graded.title)
    .slice(0, TOP_KEYWORD_SIGNALS);

  // Build a single SQL filter that matches any ungraded record sharing at least
  // one signal with the graded opportunity, UNION the graded id itself.
  // We use a raw SQL query for the bounded candidate fetch to express the
  // text-search match efficiently without Drizzle's ORM layer fighting us.
  const candidateRows = await db.execute<{ id: string; agency: string | null; naics_code: string | null; provider_name: string | null; tags: string | null; title: string | null; description: string | null }>(sql`
    SELECT id, agency, naics_code, provider_name, tags, title, description
    FROM opportunities
    WHERE (
      user_grade IS NULL
      AND (
        ${graded.agency   ? sql`agency       = ${graded.agency}`        : sql`FALSE`}
        OR ${graded.naicsCode  ? sql`naics_code   = ${graded.naicsCode}` : sql`FALSE`}
        OR ${graded.providerName ? sql`provider_name = ${graded.providerName}` : sql`FALSE`}
        ${gradedTags.length > 0
          ? sql`OR tags IS NOT NULL`
          : sql``}
        ${titleKeywords.length > 0
          ? sql`OR (title IS NOT NULL AND (${sql.join(titleKeywords.map(kw => sql`lower(title) LIKE ${'%' + kw + '%'}`), sql` OR `)}))`
          : sql``}
      )
    )
    OR id = ${graded.id}
    LIMIT ${MAX_BOUNDED_CANDIDATES}
  `);

  const rows = candidateRows.rows ?? (candidateRows as any);

  // Filter tag overlap in JS (avoids complex JSON SQL) for tag-matched rows.
  const gradedTagSet = new Set(gradedTags);
  const candidates = (Array.isArray(rows) ? rows : []).filter((row: any) => {
    if (row.id === graded.id) return true;
    if (row.user_grade) return false; // double-guard
    // Check tag overlap
    if (gradedTagSet.size > 0) {
      const rowTags = parseTags(row.tags).map((t: string) => t.toLowerCase());
      if (rowTags.some((t: string) => gradedTagSet.has(t))) return true;
    }
    return true; // already filtered by SQL signal match
  });

  let updated = 0;
  for (const candidate of candidates) {
    const newScore = scoreOpportunity(
      {
        id:           candidate.id,
        agency:       candidate.agency,
        naicsCode:    candidate.naics_code,
        providerName: candidate.provider_name,
        tags:         candidate.tags,
        title:        candidate.title,
        description:  candidate.description,
      },
      weights
    );

    await db
      .update(opportunitiesTable)
      .set({ userConfidence: String(newScore), updatedAt: new Date() })
      .where(eq(opportunitiesTable.id, candidate.id));

    updated++;
  }

  return updated;
}

// ─── Full re-score (manual endpoint only) ─────────────────────────────────────
//
// Intentional full table scan triggered only by POST /api/opportunities/feedback/rescore.
// Uses keyset (cursor-based) pagination so inserted/updated rows during the
// scan don't cause OFFSET drift.

export async function reScoreAllOpportunities(): Promise<{ updated: number }> {
  const weights = await buildSignalWeights();
  if (weights.totalGrades === 0) return { updated: 0 };

  const BATCH = 100;
  let cursor = ""; // keyset: last id seen (empty string sorts before all UUIDs)
  let updated = 0;

  while (true) {
    // Fetch the next batch of opportunities ordered by id (deterministic).
    // Use a raw SQL query to express the keyset filter cleanly.
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
          id:           opp.id,
          agency:       opp.agency,
          naicsCode:    opp.naics_code,
          providerName: opp.provider_name,
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

      updated++;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH) break;
  }

  return { updated };
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
