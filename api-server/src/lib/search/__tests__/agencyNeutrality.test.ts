import "./support/useFixtureProfile";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { decideOpportunityQuality } from "../../ingestion/opportunityIdentity";
import { agencyPriority, awardingAgencyNames, forecastAgencyCodes } from "../agencyPriority";
import { classifyResult } from "../relevance";
import { decideRelevance } from "../relevanceDecision";
import { getRelevanceProfile } from "../relevanceProfile";

const here = path.dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(fs.readFileSync(path.resolve(here, "../../../../../docs/neon-profile/regression/cases.json"), "utf8")) as Array<{ id: string; title: string; description: string; url?: string }>;
const AGENCIES = [
  "Unknown", "Department of Defense", "Department of Health and Human Services", "Department of Veterans Affairs",
  "Occupational Safety and Health Administration", "Defense Health Agency", "Centers for Disease Control and Prevention",
  "City of Springfield", "Medical Examiner Office", "Fuel Depot Authority",
];

describe("agency targeting is search priority, never relevance", () => {
  it("the accept/review/reject outcome is identical for every agency across the whole regression set", () => {
    const sensitive: string[] = [];
    for (const c of CASES) {
      const outcomes = new Set(
        AGENCIES.map((agency) => {
          const d = decideOpportunityQuality({
            externalId: "x", title: c.title, agency, type: "Solicitation", status: "active",
            postedDate: new Date("2026-09-20"), responseDeadline: new Date("2026-12-15"), description: c.description,
            sourceUrl: c.url ?? "https://sam.gov/opp/1/view", source: "samGov", providerName: "samGov",
          } as never);
          return d.status;
        }),
      );
      if (outcomes.size > 1) sensitive.push(c.id);
    }
    assert.deepEqual(sensitive, [], `agency changed the decision for: ${sensitive.join(", ")}`);
    assert.equal(CASES.length >= 122, true);
  });

  it("agency preference, filters and codes come from Neon facts", () => {
    const sp = getRelevanceProfile().searchPriority;
    assert.deepEqual(forecastAgencyCodes(), ["HHS", "DHS", "VA", "DOD", "DOL", "DOT", "USDA", "GSA"]);
    assert.equal(awardingAgencyNames().length, 5);
    assert.ok(sp.agencyTerms.includes("department of defense"));
    assert.ok(agencyPriority("Department of Defense") > 0);
    assert.ok(agencyPriority("Defense Health Agency") > 0);
    assert.equal(agencyPriority("City of Springfield"), 0);
    assert.equal(agencyPriority("Dodge County Procurement"), 0); // whole-word: "dod" does not match "dodge"
    assert.equal(agencyPriority("Police Department"), 0); // and nothing like "ice" matches inside "police"
  });

  it("changing the agency preference changes no relevance result", () => {
    const base = getRelevanceProfile();
    const altered = { ...base, searchPriority: { agencyCodes: ["ZZZ"], awardingAgencies: [], agencyTerms: ["city of springfield"] } };
    for (const c of CASES) {
      const input = { title: c.title, snippet: c.description, url: c.url ?? "https://sam.gov/opp/1/view", deadlineInFuture: true };
      const a = decideRelevance(classifyResult(input), base);
      const b = decideRelevance(classifyResult(input), altered);
      assert.deepEqual([a.verdict, a.score], [b.verdict, b.score], c.id);
    }
  });

  it("the classifier and the decision do not read agency targeting", () => {
    for (const file of ["relevance.ts", "relevanceDecision.ts"]) {
      const src = fs.readFileSync(path.resolve(here, "..", file), "utf8");
      assert.ok(!/agencyPriority|searchPriority|forecastAgencyCodes|awardingAgencyNames/.test(src), file);
    }
  });
});
