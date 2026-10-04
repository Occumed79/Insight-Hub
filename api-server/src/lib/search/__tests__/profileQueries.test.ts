import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProfileSearchQueries,
  profileExclusionOperators,
  profileProcurementExpression,
  profileServiceQueryGroups,
} from "../profileQueries";
import { getRelevanceProfile, type RelevanceProfile } from "../relevanceProfile";

const profile = getRelevanceProfile();

describe("profile-derived search queries", () => {
  it("expands every bundle service term across year, code and buyer-lane variants", () => {
    const terms = profile.searchBundles.reduce((n, b) => n + b.serviceTerms.length, 0);
    const jan = new Date("2026-01-15T00:00:00Z");
    const nov = new Date("2026-11-15T00:00:00Z");
    // 3 year variants (4 from October), PSC/NAICS/no-code, two buyer lanes + none
    assert.equal(buildProfileSearchQueries(2026, profile, jan).length, terms * 3 * 3 * 3);
    assert.equal(buildProfileSearchQueries(2026, profile, nov).length, terms * 4 * 3 * 3);
    assert.ok(buildProfileSearchQueries(2026, profile, nov).some((q) => q.includes("2027")));
  });

  it("sources service terms, codes and exclusions from the profile, so a changed profile changes the queries", () => {
    const custom: RelevanceProfile = {
      ...profile,
      searchBundles: [
        { key: "x", label: "X", serviceTerms: ['"zzz custom service"'], workforceTerms: [], procurementTerms: ["ZRFP"], exclusions: ["bogus"] },
      ],
      discoveryCodes: [
        { system: "PSC", code: "Z999", match: "exact", tier: "registered", effect: "include", title: "t", relevancePhrases: [] },
        { system: "NAICS 2022", code: "999999", match: "exact", tier: "capability", effect: "include", title: "t", relevancePhrases: [] },
      ],
      rules: [],
    };
    const queries = buildProfileSearchQueries(2026, custom, new Date("2026-01-15T00:00:00Z"));
    assert.ok(queries.every((q) => q.startsWith('"zzz custom service" (ZRFP)')));
    assert.ok(queries.some((q) => q.includes("PSC Z999")));
    assert.ok(queries.some((q) => q.includes("NAICS 999999")));
    assert.ok(queries.every((q) => q.endsWith("-bogus")));
    assert.ok(queries.every((q) => !q.includes("Q403")));
    assert.deepEqual(profileServiceQueryGroups(custom), ['("zzz custom service")']);
    assert.equal(profileProcurementExpression(custom), "(ZRFP)");
    assert.equal(profileExclusionOperators(custom, []), "");
  });

  it("negates the post-award rule triggers from the profile", () => {
    const postAward = profile.rules.find((r) => r.hard && r.action === "reject_post_award_notice");
    assert.ok(postAward && postAward.triggers.length > 0);
    const ops = profileExclusionOperators(profile, []);
    for (const trigger of postAward.triggers) assert.ok(ops.includes(`-"${trigger}"`) || ops.includes(`-${trigger}`));
  });
});
