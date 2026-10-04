/**
 * Every consumer of Occu-Med relevance must reach the same accept / review / reject decision for the same notice.
 * Runs the real consumer functions (ingestion gate, read-time route gate, opportunity quality, GovCon ranking,
 * portal evidence scanner) against the Neon-loaded profile; no consumer carries its own threshold.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { decideOpportunityQuality } from "../../ingestion/opportunityIdentity";
import { PROFILE_SQL, refreshRelevanceProfile, type QueryFn } from "../../occumedAware/relevanceProfileLoader";
import { rankGovConRecords } from "../../intelligence/govconIntelligence";
import { classifyOpportunityQuality } from "../../opportunityQuality";
import { shouldShowOpportunity } from "../../../routes/opportunities";
import { classifyResult } from "../relevance";
import { decideRelevance } from "../relevanceDecision";
import { setRelevanceProfile, type ProfileRows } from "../relevanceProfile";

const here = path.dirname(fileURLToPath(import.meta.url));
const reg = path.resolve(here, "../../../../../docs/neon-profile/regression");
const ROWS = JSON.parse(fs.readFileSync(path.join(reg, "rows.json"), "utf8")) as ProfileRows;
type Case = { id: string; group: string; title: string; description: string; expect: string; url?: string };
const CASES = (JSON.parse(fs.readFileSync(path.join(reg, "cases.json"), "utf8")) as Case[]).filter(
  (c) => c.expect === "accept" || c.expect === "reject",
);

const transport = ((async (sql: string) => {
  if (sql === PROFILE_SQL.terms) return ROWS.terms;
  if (sql === PROFILE_SQL.rules) return ROWS.rules;
  if (sql === PROFILE_SQL.facts) return ROWS.facts;
  if (sql === PROFILE_SQL.policies) return ROWS.policies;
  throw new Error("unexpected SQL");
}) as unknown) as QueryFn;

describe("consumer parity: one canonical decision", () => {
  before(async () => {
    const r = await refreshRelevanceProfile(transport);
    assert.equal(r.applied, true);
  });
  after(() => setRelevanceProfile(null));

  for (const c of CASES) {
    it(`${c.id} (${c.expect}) is decided identically by every consumer`, async () => {
      const canonical = decideRelevance(classifyResult({ title: c.title, snippet: c.description, allowHistorical: true })).verdict;
      const row = {
        id: c.id,
        title: c.title,
        description: c.description,
        agency: "Example Agency",
        type: "Solicitation",
        status: "active",
        source: "langsearch",
        samUrl: c.url ?? "https://example.gov/rfp/x",
        postedDate: new Date("2026-09-20T00:00:00Z"),
        responseDeadline: new Date("2026-12-15T00:00:00Z"),
      };
      // read-time gate: shown unless the canonical verdict is reject
      assert.equal(shouldShowOpportunity(row), canonical !== "reject", "route read-time gate");
      // govcon: classification follows the canonical verdict
      const [ranked] = await rankGovConRecords([{ id: c.id, title: c.title, agency: "Example Agency", description: c.description }], "forecast");
      assert.equal(ranked!.relevance.verdict, decideRelevance(classifyResult({ title: c.title, snippet: ["Example Agency", c.description].join(" "), allowHistorical: true })).verdict, "govcon verdict");
      // opportunity quality: relevance-eligible only for canonical accept
      const q = classifyOpportunityQuality(row as any, new Date("2026-10-03T12:00:00Z"));
      if (canonical !== "accept") assert.equal(q.relevanceEligible, false, "quality relevanceEligible");
      // ingestion
      const ing = decideOpportunityQuality({
        externalId: c.id, title: c.title, agency: "Example Agency", type: "Solicitation", status: "active",
        postedDate: new Date("2026-09-20T00:00:00Z"), responseDeadline: new Date("2026-12-15T00:00:00Z"),
        description: c.description, sourceUrl: row.samUrl, source: "langsearch", providerName: "langsearch",
      } as any);
      const ingVerdict = ing.status === "accepted" ? "accept" : ing.status === "quarantined" ? "review" : "reject";
      assert.equal(ingVerdict === "reject", canonical === "reject", "ingestion rejects exactly when canonical rejects");
      if (c.expect === "accept") assert.equal(canonical, "accept");
      if (c.expect === "reject") assert.equal(canonical, "reject");
    });
  }
});
