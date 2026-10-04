import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRelevanceProfile } from "../../search/relevanceProfile";
import { assessIntelText, evidenceScore, profileEvidence } from "../profileIntelRelevance";

describe("intelligence relevance reads the profile", () => {
  const profile = getRelevanceProfile();
  const explicit = profile.categories.find((c) => !c.adjacentOnly && c.explicit.length > 0)!.explicit[0]!;

  it("accepts a notice-like text that names a profile explicit phrase with a procurement signal", () => {
    const signal = profile.procurementSignals.find((term) => term === "solicitation") ?? profile.procurementSignals[0]!;
    const result = assessIntelText({ title: `${explicit} ${signal}`, text: `${signal} for ${explicit}` });
    assert.equal(result.topical, true);
    assert.ok(result.score >= profile.thresholds.reviewMin);
    assert.notEqual(result.verdict, "reject");
  });

  it("does not treat unrelated text as topical or acceptable", () => {
    const result = assessIntelText({ title: "Quarterly cafeteria menu update", text: "New seasonal menu items" });
    assert.equal(result.topical, false);
    assert.equal(result.verdict, "reject");
  });

  it("hard notice rules from the profile still reject, whatever service phrase is present", () => {
    const rule = profile.rules.find(
      (r) =>
        r.hard &&
        ["reject_not_a_procurement", "reject_post_award_notice", "reject_as_out_of_scope"].includes(r.action) &&
        r.scope.match === "any_trigger" &&
        !r.scope.not_triggered_by_workforce_terms &&
        r.triggers.length > 0,
    )!;
    const result = assessIntelText({ title: `${explicit} services`, text: `${explicit} ${rule.triggers[0]}` });
    assert.equal(result.verdict, "reject");
  });

  it("profileEvidence reports categories and evidenceScore is anchored to the profile thresholds", () => {
    const none = profileEvidence("nothing relevant here");
    assert.equal(none.total, 0);
    assert.ok(evidenceScore(none) < profile.thresholds.reviewMin);

    const one = profileEvidence(`notice about ${explicit}`);
    assert.ok(one.total > 0 && one.categories.length >= 1);
    assert.ok(evidenceScore(one) >= profile.thresholds.reviewMin);

    const categories = profile.categories.filter((c) => !c.adjacentOnly && c.explicit.length > 0);
    const two = profileEvidence(`${categories[0]!.explicit[0]} and ${categories[1]!.explicit[0]}`);
    assert.ok(two.categories.length >= 2);
    assert.equal(evidenceScore(two), profile.thresholds.acceptMin);
  });
});
