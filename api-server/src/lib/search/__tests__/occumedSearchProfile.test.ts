import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { builtInCodes, mergeSearchProfile } from "../occumedSearchProfile";
import { classifyResult, setProfileDirectPhrases } from "../relevance";

describe("Occu-Med search profile", () => {
  afterEach(() => setProfileDirectPhrases([]));

  it("puts the team's profile codes first, then built-in codes, without duplicates", () => {
    const merged = mergeSearchProfile({ naics: ["999999", builtInCodes().naics[0]!], psc: ["Z999"], directPhrases: ["x"] });
    assert.equal(merged.naics[0], "999999");
    assert.equal(new Set(merged.naics).size, merged.naics.length);
    assert.equal(merged.psc[0], "Z999");
    assert.equal(merged.loaded, true);
  });

  it("falls back to built-in codes when the profile is unavailable", () => {
    const merged = mergeSearchProfile(null);
    assert.equal(merged.loaded, false);
    assert.ok(merged.naics.length > 0 && merged.psc.length > 0);
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
    setProfileDirectPhrases(["contractor workforce wellness clearance"]);
    const after = classifyResult(input);
    assert.ok(after.matchedExplicitPhrases.includes("contractor workforce wellness clearance"));
    assert.ok(after.score >= before.score);
  });
});
