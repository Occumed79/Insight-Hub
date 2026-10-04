import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { fixtureProfile, installFixtureProfile, loadFixtureRows } from "./support/useFixtureProfile";
import { mergeSearchProfile, profileDiscoveryCodes, profileDirectPhrases } from "../occumedSearchProfile";
import { classifyResult } from "../relevance";
import { buildProfile, getRelevanceProfile, setRelevanceProfile } from "../relevanceProfile";

describe("Occu-Med search profile", () => {
  afterEach(() => installFixtureProfile());

  it("puts the reference (registered) codes first, then profile discovery codes, without duplicates", () => {
    const merged = mergeSearchProfile({ naics: ["999999", profileDiscoveryCodes().naics[0]!], psc: ["Z999"] });
    assert.equal(merged.naics[0], "999999");
    assert.equal(new Set(merged.naics).size, merged.naics.length);
    assert.equal(merged.psc[0], "Z999");
    assert.equal(merged.loaded, true);
  });

  it("falls back to the profile's discovery codes when the reference is unavailable", () => {
    const merged = mergeSearchProfile(null);
    assert.ok(merged.naics.length > 0 && merged.psc.length > 0);
    assert.ok(merged.directPhrases.length > 0);
  });

  it("derives discovery codes and phrases only from the profile", () => {
    const codes = profileDiscoveryCodes(fixtureProfile());
    assert.ok(codes.psc.includes("Q403"));
    assert.ok(profileDirectPhrases(fixtureProfile()).includes("fitness for duty"));
  });

  it("treats a profile direct phrase as explicit evidence in the relevance gate", () => {
    const input = {
      title: "Contractor workforce wellness clearance program",
      snippet: "Solicitation for a contractor workforce wellness clearance program. Proposals due in 30 days.",
      url: "https://sam.gov/opp/x/view",
      date: new Date().toISOString(),
      deadlineInFuture: true,
    };
    const before = classifyResult(input);
    const base = loadFixtureRows();
    const rows = {
      ...base,
      terms: [
        ...base.terms,
        { phrase: "contractor workforce wellness clearance", term_type: "procurement_phrase", match_strength: "direct", target_keys: [], metadata: {} },
      ],
    };
    assert.equal(setRelevanceProfile(buildProfile(rows, "neon")).applied, true);
    const after = classifyResult(input);
    assert.equal(getRelevanceProfile().source, "neon");
    assert.ok(after.matchedExplicitPhrases.includes("contractor workforce wellness clearance"));
    assert.ok(after.score >= before.score);
  });
});
