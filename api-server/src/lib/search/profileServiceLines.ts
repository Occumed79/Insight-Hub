/**
 * Service-line detection for display and rule-check briefs.
 *
 * A "service line" is a service category of the Neon relevance profile (non-adjacent categories). A record shows a
 * line when its text carries that category's evidence terms. No term, label or pattern is defined here: both the
 * labels and the evidence terms come from `getRelevanceProfile()` at call time, so a profile refresh changes the
 * result without a code change.
 */
import { getRelevanceProfile, type ProfileCategory, type RelevanceProfile } from "./relevanceProfile";

interface PreparedCategory {
  label: string;
  explicit: string[];
  regulatory: string[];
  component: string[];
}

const prepared = new WeakMap<RelevanceProfile, PreparedCategory[]>();

/** Lowercase, punctuation to single spaces, padded so word-start matching is a plain substring test. */
function normalize(value: string | null | undefined): string {
  return ` ${(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function prepareTerms(terms: string[]): string[] {
  return Array.from(new Set(terms.map((t) => normalize(t).trimEnd()).filter((t) => t.trim().length > 0)));
}

function prepare(profile: RelevanceProfile): PreparedCategory[] {
  let result = prepared.get(profile);
  if (!result) {
    result = profile.categories
      .filter((c: ProfileCategory) => !c.adjacentOnly)
      .map((c) => ({
        label: c.label,
        explicit: prepareTerms(c.explicit),
        regulatory: prepareTerms(c.regulatory),
        component: prepareTerms(c.component),
      }));
    prepared.set(profile, result);
  }
  return result;
}

/** Terms match at a word start, so plurals match ("audiogram" in "audiograms") and mid-word hits do not. */
function hits(haystack: string, terms: string[]): number {
  let count = 0;
  for (const term of terms) if (haystack.includes(term)) count += 1;
  return count;
}

/**
 * Profile service-line labels evidenced by `text`, strongest first. A line needs an explicit or regulatory term, or
 * at least two component terms (the same evidence bar the classifier applies to component-only matches).
 */
export function matchedServiceLines(
  text: string,
  options: { max?: number; profile?: RelevanceProfile } = {},
): string[] {
  const profile = options.profile ?? getRelevanceProfile();
  const haystack = normalize(text);
  const scored: Array<{ label: string; score: number; order: number }> = [];
  prepare(profile).forEach((category, order) => {
    const explicit = hits(haystack, category.explicit);
    const regulatory = hits(haystack, category.regulatory);
    const component = hits(haystack, category.component);
    if (explicit > 0 || regulatory > 0 || component >= 2) {
      scored.push({ label: category.label, score: explicit * 3 + regulatory * 2 + component, order });
    }
  });
  const labels = scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.label);
  return options.max ? labels.slice(0, options.max) : labels;
}
