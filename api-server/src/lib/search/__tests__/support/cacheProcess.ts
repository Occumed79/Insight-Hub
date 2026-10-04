/** Child process for profileCachePersistence.test.ts: `write` loads from (mock) Neon, `read` runs with Neon down. */
import { PROFILE_SQL, refreshRelevanceProfile, type QueryFn } from "../../../occumedAware/relevanceProfileLoader";
import { loadFixtureRows } from "./useFixtureProfile";
import { getRelevanceProfile, setRelevanceProfile } from "../../relevanceProfile";

const rows = loadFixtureRows();
const good: QueryFn = (async (sql: string) =>
  sql === PROFILE_SQL.terms ? rows.terms : sql === PROFILE_SQL.rules ? rows.rules : sql === PROFILE_SQL.facts ? rows.facts : rows.policies) as QueryFn;
const down: QueryFn = (async () => {
  throw new Error("neon unreachable");
}) as QueryFn;

setRelevanceProfile(null); // start empty, like a fresh process
const result = await refreshRelevanceProfile(process.argv[2] === "write" ? good : down);
const p = getRelevanceProfile();
console.log(JSON.stringify({ source: p.source, version: p.version, applied: result.applied, categories: p.categories.length }));
