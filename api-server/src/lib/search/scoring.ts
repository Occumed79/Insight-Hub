import type { NormalizedOpportunity } from "../providers/types";

export interface ScoredOpportunity {
  opportunity: NormalizedOpportunity;
  score: number;
  signals: string[];
}

/**
 * Score and rank normalized opportunities based on configurable criteria.
 * This is rule-based scoring; Gemini AI scoring is separate (in gemini.ts).
 *
 * Scoring factors:
 * - Has a response deadline (time-sensitive) → +10
 * - Status is "active" → +20
 * - Has a NAICS code → +5
 * - Has a description → +5
 * - Has a SAM/source URL → +5
 * - Set-aside matches small business criteria → +15
 */
export function scoreOpportunities(
  opportunities: NormalizedOpportunity[],
  options: {
    preferActive?: boolean;
    keywords?: string[];
    naicsCodes?: string[];
    setAsidePreferences?: string[];
  } = {}
): ScoredOpportunity[] {
  return opportunities
    .map((opp) => {
      let score = 0;
      const signals: string[] = [];

      if (options.preferActive !== false && opp.status === "active") {
        score += 20;
        signals.push("Active opportunity");
      }

      if (opp.responseDeadline) {
        score += 10;
        const daysUntilDeadline = Math.floor(
          (opp.responseDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntilDeadline > 0 && daysUntilDeadline <= 14) {
          score += 15;
          signals.push(`Response due in ${daysUntilDeadline} days`);
        } else if (daysUntilDeadline > 0) {
          signals.push(`Response due in ${daysUntilDeadline} days`);
        }
      }

      if (opp.naicsCode) {
        score += 5;
        if (options.naicsCodes?.includes(opp.naicsCode)) {
          score += 20;
          signals.push(`Matching NAICS: ${opp.naicsCode}`);
        }
      }

      if (opp.description) score += 5;
      if (opp.sourceUrl) score += 5;

      if (opp.setAside) {
        const lower = opp.setAside.toLowerCase();
        if (lower.includes("small business") || lower.includes("8(a)") || lower.includes("sdvosb") || lower.includes("wosb")) {
          score += 15;
          signals.push(`Set-aside: ${opp.setAside}`);
        }
        if (options.setAsidePreferences?.some((p) => lower.includes(p.toLowerCase()))) {
          score += 10;
        }
      }

      if (options.keywords?.length) {
        const text = `${opp.title} ${opp.description ?? ""} ${opp.agency}`.toLowerCase();
        for (const kw of options.keywords) {
          if (text.includes(kw.toLowerCase())) {
            score += 10;
            signals.push(`Keyword match: ${kw}`);
          }
        }
      }

      return { opportunity: opp, score, signals };
    })
    .sort((a, b) => b.score - a.score);
}
