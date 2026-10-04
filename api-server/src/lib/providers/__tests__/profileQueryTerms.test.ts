import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRelevanceProfile } from "../../search/relevanceProfile";
import {
  profileCodesFor,
  profileLeadQueries,
  profilePolicyTerms,
  profileProcurementTerms,
  profileSearchPhrases,
  profileSemanticQuery,
  quotedOr,
  termRegex,
} from "../profileQueryTerms";

describe("profile-derived provider query terms", () => {
  const profile = getRelevanceProfile();

  it("lead queries come one per search bundle that has service terms", () => {
    const leads = profileLeadQueries();
    const bundles = profile.searchBundles.filter((bundle) => bundle.serviceTerms.length > 0);
    assert.ok(leads.length > 0 && leads.length <= bundles.length);
    assert.deepEqual(profileLeadQueries(2), leads.slice(0, 2));
  });

  it("semantic query is bounded and built only from lead queries", () => {
    const query = profileSemanticQuery(60);
    assert.ok(query.length <= 60);
    assert.ok(query.startsWith(profileLeadQueries()[0]!));
  });

  it("search phrases start with the lead queries and then add profile direct phrases", () => {
    const leads = profileLeadQueries();
    const phrases = profileSearchPhrases(leads.length + 3);
    assert.deepEqual(phrases.slice(0, leads.length), leads);
    assert.equal(phrases.length, leads.length + 3);
  });

  it("procurement and policy terms come from the profile bundles", () => {
    const procurement = profileProcurementTerms();
    assert.ok(procurement.length > 0);
    const allBundleProcurement = new Set(profile.searchBundles.flatMap((bundle) => bundle.procurementTerms));
    for (const term of procurement) assert.ok(allBundleProcurement.has(term));
    const policy = profilePolicyTerms();
    const policyBundles = profile.searchBundles.filter((bundle) => bundle.serviceTerms.length === 0);
    assert.deepEqual(policy, Array.from(new Set(policyBundles.flatMap((bundle) => bundle.procurementTerms))));
  });

  it("code lists are exact positive discovery codes of one system, registered tier first", () => {
    const naics = profileCodesFor("NAICS");
    const psc = profileCodesFor("PSC");
    const cpv = profileCodesFor("CPV");
    assert.ok(naics.length > 0 && psc.length > 0 && cpv.length > 0);
    for (const code of naics) assert.match(code, /^\d{6}$/);
    for (const code of cpv) assert.match(code, /^\d{8}$/);
    const registeredPsc = profile.discoveryCodes.filter((d) => d.system === "PSC" && d.tier === "registered" && d.match === "exact").map((d) => d.code);
    assert.deepEqual(psc.slice(0, registeredPsc.length).sort(), [...registeredPsc].sort());
  });

  it("quotedOr and termRegex handle quotes, spacing and empty input", () => {
    assert.equal(quotedOr(['a "b"', "  ", "c d"]), '"a b" OR "c d"');
    assert.equal(termRegex([]), null);
    const regex = termRegex(["bid opening", "rfp"])!;
    assert.ok(regex.test("Bid   Opening scheduled"));
    assert.ok(regex.test("An RFP was issued"));
    assert.equal(regex.test("rfpx"), false);
  });
});
