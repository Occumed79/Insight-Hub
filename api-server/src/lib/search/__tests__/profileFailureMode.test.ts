/**
 * Neon-unavailable failure mode: verified cache, else fail closed. There is no embedded vocabulary to fall back to.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadFixtureRows } from "./support/useFixtureProfile";
import { decideOpportunityQuality } from "../../ingestion/opportunityIdentity";
import { CACHE_FORMAT, CACHE_MAX_AGE_MS, cachePath, readProfileCache, writeProfileCache } from "../../occumedAware/relevanceProfileCache";
import { PROFILE_SQL, refreshRelevanceProfile, type QueryFn } from "../../occumedAware/relevanceProfileLoader";
import type { NormalizedOpportunity } from "../../providers/types";
import { classifyResult } from "../relevance";
import { decideRelevance } from "../relevanceDecision";
import { profileDefaultQueries } from "../profileText";
import { buildProfile, getRelevanceProfile, profileVersion, setRelevanceProfile, type ProfileRows } from "../relevanceProfile";

const ROWS = loadFixtureRows();
const GOOD: QueryFn = (async (sql: string) => {
  if (sql === PROFILE_SQL.terms) return ROWS.terms;
  if (sql === PROFILE_SQL.rules) return ROWS.rules;
  if (sql === PROFILE_SQL.facts) return ROWS.facts;
  if (sql === PROFILE_SQL.policies) return ROWS.policies;
  throw new Error("unexpected SQL");
}) as QueryFn;
const DOWN: QueryFn = (async () => {
  throw new Error("connect ETIMEDOUT");
}) as QueryFn;

const NOTICE = { title: "Pre-Employment Physical Examination Services", description: "Request for proposals for pre-employment physical examinations for employees.", url: "https://sam.gov/opp/1/view", deadlineInFuture: true };
const OPP: NormalizedOpportunity = {
  externalId: "x1",
  title: NOTICE.title,
  agency: "Department of Veterans Affairs",
  type: "Solicitation",
  status: "active",
  postedDate: new Date("2026-09-20T00:00:00Z"),
  responseDeadline: new Date("2026-12-15T00:00:00Z"),
  description: NOTICE.description,
  sourceUrl: NOTICE.url,
  source: "samGov",
  providerName: "samGov",
};

let dir: string;
const saved = { cache: process.env.RELEVANCE_PROFILE_CACHE_PATH, url: process.env.OCCU_MED_AWARE_DATABASE_URL };
const readFile = () => JSON.parse(fs.readFileSync(cachePath(), "utf8"));
const writeFile = (f: unknown) => fs.writeFileSync(cachePath(), JSON.stringify(f));

describe("Neon unavailable: verified cache, else fail closed", () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "relprofile-"));
    process.env.RELEVANCE_PROFILE_CACHE_PATH = path.join(dir, "cache.json");
    process.env.OCCU_MED_AWARE_DATABASE_URL = "postgres://u:secret@neon.example/occumed";
    setRelevanceProfile(null);
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (saved.cache === undefined) delete process.env.RELEVANCE_PROFILE_CACHE_PATH; else process.env.RELEVANCE_PROFILE_CACHE_PATH = saved.cache;
    if (saved.url === undefined) delete process.env.OCCU_MED_AWARE_DATABASE_URL; else process.env.OCCU_MED_AWARE_DATABASE_URL = saved.url;
    setRelevanceProfile(buildProfile(ROWS, "neon"));
  });

  it("with no Neon and no cache the profile is empty and nothing is accepted or discarded", async () => {
    const r = await refreshRelevanceProfile(DOWN);
    assert.equal(r.applied, false);
    assert.equal(r.source, "unavailable");
    const p = getRelevanceProfile();
    assert.equal(p.categories.length, 0);
    assert.equal(p.allServiceTerms.length, 0);
    const decision = decideRelevance(classifyResult(NOTICE));
    assert.equal(decision.verdict, "review");
    assert.equal(decision.basis, "unavailable");
    assert.equal(decision.profileSource, "unavailable");
    // A notice that is plainly irrelevant is also held, never discarded: nothing can be judged without the profile.
    const junk = decideRelevance(classifyResult({ title: "Lawn mowing", description: "Grounds maintenance", url: "https://example.gov/x", deadlineInFuture: true }));
    assert.equal(junk.verdict, "review");
  });

  it("ingestion quarantines (never accepts, never rejects) while the profile is unavailable", async () => {
    await refreshRelevanceProfile(DOWN);
    assert.equal(decideOpportunityQuality(OPP).status, "quarantined");
  });

  it("query builders emit nothing while the profile is unavailable", async () => {
    await refreshRelevanceProfile(DOWN);
    assert.deepEqual(profileDefaultQueries(2026), []);
  });

  it("a successful Neon load writes the cache; a later outage serves the identical profile from it", async () => {
    const live = await refreshRelevanceProfile(GOOD);
    assert.equal(live.source, "neon");
    const liveDecision = decideRelevance(classifyResult(NOTICE));
    assert.ok(fs.existsSync(cachePath()));

    setRelevanceProfile(null); // process restart while Neon is down
    const down = await refreshRelevanceProfile(DOWN);
    assert.equal(down.source, "cache");
    assert.equal(down.version, live.version);
    assert.equal(getRelevanceProfile().version, profileVersion(ROWS));
    const cachedDecision = decideRelevance(classifyResult(NOTICE));
    assert.equal(cachedDecision.profileSource, "cache");
    assert.equal(cachedDecision.verdict, liveDecision.verdict);
    assert.equal(cachedDecision.score, liveDecision.score);
  });

  it("an incomplete live profile does not overwrite the cache", async () => {
    await refreshRelevanceProfile(GOOD);
    const before = fs.readFileSync(cachePath(), "utf8");
    const partial: ProfileRows = { ...ROWS, facts: ROWS.facts.filter((f) => f.category !== "relevance_threshold") };
    const partialQuery: QueryFn = (async (sql: string) => (sql === PROFILE_SQL.facts ? partial.facts : (await GOOD(sql)) as unknown[])) as QueryFn;
    await refreshRelevanceProfile(partialQuery);
    assert.equal(fs.readFileSync(cachePath(), "utf8"), before);
  });

  it("a hand-edited cache (rows changed, version untouched) is rejected", async () => {
    await refreshRelevanceProfile(GOOD);
    const f = readFile();
    f.rows.terms.push({ phrase: "lawn mowing", term_type: "procurement_phrase", match_strength: "direct", target_keys: [], metadata: {} });
    writeFile(f);
    assert.deepEqual(readProfileCache(), { ok: false, reason: "checksum mismatch" });
    setRelevanceProfile(null);
    assert.equal((await refreshRelevanceProfile(DOWN)).source, "unavailable");
  });

  it("a hand-edited cache with a recomputed version is still rejected (signature)", async () => {
    await refreshRelevanceProfile(GOOD);
    const f = readFile();
    f.rows.terms.push({ phrase: "lawn mowing", term_type: "procurement_phrase", match_strength: "direct", target_keys: [], metadata: {} });
    f.version = profileVersion(f.rows);
    writeFile(f);
    assert.deepEqual(readProfileCache(), { ok: false, reason: "signature mismatch" });
  });

  it("a cache written under a different Neon credential is rejected", async () => {
    await refreshRelevanceProfile(GOOD);
    process.env.OCCU_MED_AWARE_DATABASE_URL = "postgres://u:other@neon.example/occumed";
    assert.deepEqual(readProfileCache(), { ok: false, reason: "signature mismatch" });
  });

  it("an expired cache is rejected", async () => {
    await refreshRelevanceProfile(GOOD);
    assert.equal(readProfileCache(Date.now() + CACHE_MAX_AGE_MS - 60_000).ok, true);
    assert.deepEqual(readProfileCache(Date.now() + CACHE_MAX_AGE_MS + 60_000), { ok: false, reason: "cache expired" });
  });

  it("malformed, foreign-format and missing caches are rejected", () => {
    assert.equal(readProfileCache().ok, false);
    fs.writeFileSync(cachePath(), "{not json");
    assert.equal(readProfileCache().ok, false);
    writeFile({ format: "other", version: "x", rows: { terms: [], rules: [], facts: [], policies: [] } });
    assert.deepEqual(readProfileCache(), { ok: false, reason: "unrecognized cache format" });
    assert.ok(CACHE_FORMAT.startsWith("occumed-relevance-profile-cache"));
  });

  it("nothing is written without the Neon credential", () => {
    delete process.env.OCCU_MED_AWARE_DATABASE_URL;
    assert.equal(writeProfileCache(ROWS), false);
    assert.equal(fs.existsSync(cachePath()), false);
  });

  it("a live profile already in memory is kept through a transient Neon failure", async () => {
    await refreshRelevanceProfile(GOOD);
    const r = await refreshRelevanceProfile(DOWN);
    assert.equal(r.source, "neon");
    assert.equal(r.applied, false);
  });
});

describe("annual contract has no purchase-frame power", () => {
  it("is not a frame, unit or context term in the commodity rule", () => {
    const rule = ROWS.rules.find((r) => r.rule_key === "rv_commodity_raw_material_supply")!;
    const scope = rule.scope as Record<string, string[]>;
    for (const list of [scope.purchase_frames, scope.unit_terms, scope.context_terms, rule.search_triggers ?? []]) {
      assert.ok(!list.some((t) => /annual contract/i.test(t)));
    }
  });
});
