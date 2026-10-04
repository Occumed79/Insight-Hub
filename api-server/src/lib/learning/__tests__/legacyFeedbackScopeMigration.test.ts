import "../../search/__tests__/support/useFixtureProfile";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contextHash, deriveOpportunityContext, type ContextSignalState } from "../contextualFeedback";
import { FEEDBACK_KEY_PREFIX, mapLegacyContext, migrateLegacyFeedbackScopes, type FeedbackStore } from "../legacyFeedbackScopeMigration";
import { getRelevanceProfile } from "../../search/relevanceProfile";

const key = (context: string) => `${FEEDBACK_KEY_PREFIX}${contextHash(context)}`;
const state = (context: string, extra: Partial<ContextSignalState> = {}): ContextSignalState => ({
  context,
  contextHash: contextHash(context),
  grades: 1,
  gradesByOpportunity: { o1: "good" },
  agencies: { "department of defense": 1 },
  naics: { "621111": 1 },
  tags: {},
  keywords: { audiometric: 1 },
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

function memoryStore(initial: Record<string, string>): FeedbackStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async list() {
      return [...data.entries()].map(([k, value]) => ({ key: k, value }));
    },
    async transaction(_keys, fn) {
      await fn({ read: async (k) => data.get(k), write: async (k, v) => void data.set(k, v) });
    },
  };
}

describe("legacy learned-feedback scope migration", () => {
  const profile = getRelevanceProfile();

  it("aliases come from the Neon profile, not from code", () => {
    assert.equal(Object.keys(profile.feedbackScopeAliases).length, 8);
    assert.deepEqual(profile.feedbackScopeAliases["audiometry"], ["hearing_audiometry"]);
  });

  it("maps legacy contexts to canonical ones, preserves unmappable records and is idempotent", async () => {
    const legacyAudio = "scope:audiometry agency:department veterans affairs";
    const legacyCombo = "scope:audiometry+respiratory";
    const alreadyCanonical = "scope:drug-alcohol";
    const queryCtx = "query:audiometric testing";
    const unmappable = "scope:audiometry+mystery-line";
    const canonicalTarget = "scope:hearing-audiometry agency:department veterans affairs";

    const existingTarget = state(canonicalTarget, { gradesByOpportunity: { o9: "excellent" }, grades: 1, agencies: { "department of defense": 2 } });
    const store = memoryStore({
      [key(legacyAudio)]: JSON.stringify(state(legacyAudio)),
      [key(legacyCombo)]: JSON.stringify(state(legacyCombo, { gradesByOpportunity: { o2: "poor" } })),
      [key(alreadyCanonical)]: JSON.stringify(state(alreadyCanonical)),
      [key(queryCtx)]: JSON.stringify(state(queryCtx)),
      [key(unmappable)]: JSON.stringify(state(unmappable)),
      [key(canonicalTarget)]: JSON.stringify(existingTarget),
      "settings-unrelated": "{}",
    });
    const unmappableBefore = store.data.get(key(unmappable));

    const report = await migrateLegacyFeedbackScopes(profile, store);
    assert.equal(report.total, 6);
    assert.equal(report.mapped, 2);
    assert.equal(report.unmapped.length, 1);
    assert.equal(report.unmapped[0]!.context, unmappable);
    assert.equal(report.skipped, 3); // canonical scope, query context, the pre-existing canonical row

    // mapped: new canonical row exists, merged with the row that was already there; old row kept and marked
    const merged = JSON.parse(store.data.get(key(canonicalTarget))!) as ContextSignalState;
    assert.equal(merged.context, canonicalTarget);
    assert.deepEqual(Object.keys(merged.gradesByOpportunity).sort(), ["o1", "o9"]);
    assert.equal(merged.grades, 2);
    assert.equal(merged.agencies["department of defense"], 3);
    assert.equal(merged.keywords["audiometric"], 2);
    const comboNew = "scope:hearing-audiometry+respiratory-fit-testing";
    assert.ok(store.data.has(key(comboNew)));
    const oldRow = JSON.parse(store.data.get(key(legacyAudio))!);
    assert.equal(oldRow.legacyMigratedTo, contextHash(canonicalTarget));
    assert.equal(oldRow.context, legacyAudio); // nothing deleted or rewritten beyond the marker

    // unmappable and untouched records are byte-for-byte preserved
    assert.equal(store.data.get(key(unmappable)), unmappableBefore);
    assert.ok(store.data.has(key(queryCtx)) && store.data.has(key(alreadyCanonical)) && store.data.has("settings-unrelated"));

    // idempotent
    const before = new Map(store.data);
    const again = await migrateLegacyFeedbackScopes(profile, store);
    assert.equal(again.mapped, 0);
    assert.deepEqual([...store.data.entries()], [...before.entries()]);
  });

  it("a migrated key is the key the new code derives, so the history applies to new notices", () => {
    const legacy = "scope:audiometry agency:department veterans affairs";
    const mapped = mapLegacyContext(legacy, profile.feedbackScopeAliases);
    assert.equal(mapped.kind, "mapped");
    const derived = deriveOpportunityContext({ title: "Hearing conservation program", agency: "Department of Veterans Affairs" });
    assert.equal(derived, (mapped as { context: string }).context);
  });
});
