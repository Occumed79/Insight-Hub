/**
 * Regression suite for the Neon-backed Occu-Med relevance profile.
 *
 * Run from api-server/:  node --import tsx ../docs/neon-profile/regression/run_regression.mts
 *
 * What this does (and does not do):
 *  - Vocabulary comes ONLY from profile.json (the migration files, checksum-verified against the
 *    test branch). The legacy ontology arrays are overwritten in memory before the classifier loads.
 *  - Classifier evidence-combination mechanics (paths A-E, score arithmetic) are the app's real
 *    classifyResult, unchanged.
 *  - Rule semantics the legacy classifier cannot read from data (hard-reject rules, title-scoped rules,
 *    conditional penalties from rule scope) are applied by the small adapter below, exactly as the
 *    rule `scope` documents them. This adapter is TEST CODE ONLY: it stands in for the loader/engine
 *    change that the consumer refactor will make, so the same cases can be re-run against the app.
 *  - Thresholds come from the relevance.accept_min / relevance.review_min facts (env overrides for sweeps).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const P = JSON.parse(fs.readFileSync(path.join(here, "profile.json"), "utf8"));
const CASES = JSON.parse(fs.readFileSync(path.join(here, "cases.json"), "utf8"));
const src = path.join(here, "../../../api-server/src/lib");

// ---- 1. overwrite legacy vocabulary with the Neon profile BEFORE the classifier loads
const ont: any = await import(path.join(src, "search/occumedProcurementOntology.ts"));
for (const c of ont.SERVICE_CATEGORIES) {
  const pc = P.categories[c.id];
  if (!pc) continue;
  c.explicitPhrases = pc.explicit;
  c.highIntentPhrases = [];
  c.componentTerms = pc.component;
  c.supportingTerms = [];
  c.regulatoryTerms = pc.regulatory;
}
const replace = (arr: string[], next: string[]) => arr.splice(0, arr.length, ...next);
replace(ont.HARD_REJECT_TERMS, []); // hard rejects now come from Neon rules (adapter below)
replace(ont.PROCUREMENT_SIGNALS, P.procurementSignals);
replace(ont.WORKFORCE_SIGNALS, P.workforceSignals);
replace(ont.REGULATORY_STANDARDS_TERMS, P.regulatory);
ont.CONDITIONAL_NEGATIVE_GROUPS.splice(0); // conditional penalties come from Neon rules (adapter below)
ont.BUYER_SECTOR_SIGNALS.splice(1);
ont.BUYER_SECTOR_SIGNALS[0].phrases = P.prime;

const rel: any = await import(path.join(src, "search/relevance.ts"));
rel.setProfileDirectPhrases(P.generalExplicit);

// ---- 2. rule adapter (scope semantics as documented in the rules' scope json)
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matcher = (t: string) => {
  const s = t.trim();
  return new RegExp((/^\w/.test(s) ? "\\b" : "") + esc(s) + (/\w$/.test(s) ? "\\b" : ""), "i");
};
const any = (text: string, terms: string[]) => terms.filter((t) => matcher(t).test(text));
const serviceTerms: string[] = Object.values<any>(P.categories).flatMap((c) => [
  ...c.explicit, ...c.component, ...c.regulatory,
]);
const HARD = new Set(["reject_not_a_procurement", "reject_post_award_notice", "reject_as_out_of_scope"]);

function ruleLayer(title: string, haystack: string) {
  const hits: string[] = [];
  let penalty = 0;
  for (const r of P.rules) {
    if (HARD.has(r.action)) {
      const m = any(haystack, r.triggers);
      if (m.length) hits.push(`${r.key}:${m[0]}`);
    } else if (r.action === "reject_when_title_scope_non_medical") {
      const m = any(title, r.triggers);
      if (m.length && any(title, serviceTerms).length === 0) hits.push(`${r.key}:${m[0]}`);
    } else if (r.action === "conditional_reject_unless_service_evidence") {
      const m = any(haystack, r.triggers);
      if (m.length && any(haystack, r.scope.requires_one_of ?? []).length === 0) {
        const per = r.scope.penalties
          ? Math.max(...m.map((t: string) => r.scope.penalties[t] ?? 0))
          : r.scope.penalty ?? 0;
        penalty += per;
      }
    }
  }
  return { hits, penalty };
}

// ---- 3. decisions
const acceptMin = Number(process.env.ACCEPT_MIN ?? P.thresholds["relevance.accept_min"]);
const reviewMin = Number(process.env.REVIEW_MIN ?? P.thresholds["relevance.review_min"]);

type Row = {
  id: string; group: string; expect: string; decision: string; layer: string;
  score: number | null; penalty: number; confidence: string | null; detail: string; pass: boolean;
};
const rows: Row[] = [];
for (const c of CASES) {
  const haystack = ` ${c.title} ${c.description} `;
  const { hits, penalty } = ruleLayer(c.title, haystack);
  let decision = "reject", layer = "", score: number | null = null, confidence: string | null = null, detail = "";
  if (hits.length) {
    layer = "neon_rule"; detail = hits.join("; ");
  } else {
    const r = rel.classifyResult({ title: c.title, description: c.description, url: c.url, deadlineInFuture: c.deadline !== false, date: c.date ?? null, allowHistorical: !c.date });
    confidence = r.confidence;
    score = Math.max(0, r.score - penalty);
    if (r.rejected && r.confidence === "insufficient" && score >= reviewMin) { decision = "review"; layer = "classifier_review"; detail = r.rejectReason ?? ""; }
    else if (r.rejected) { layer = "classifier"; detail = r.rejectReason ?? ""; }
    else if (penalty >= 40) { layer = "conditional_rule"; detail = `penalty ${penalty}`; }
    else if (score >= acceptMin) { decision = "accept"; layer = "threshold"; }
    else if (score >= reviewMin) { decision = "review"; layer = "threshold"; }
    else { layer = "threshold"; detail = "below review_min"; }
  }
  const pass = c.expect === "accept" ? decision === "accept" : c.expect === "not_reject" ? decision !== "reject" : c.expect === "not_accept" ? decision !== "accept" : decision === "reject";
  rows.push({ id: c.id, group: c.group, expect: c.expect, decision, layer, score, penalty, confidence, detail, pass });
}

// ---- 4. stale / expired records (app's real merge + expiration functions)
const pr: any = await import(path.join(src, "ingestion/pipelineRules.ts"));
const ex: any = await import(path.join(src, "ingestion/opportunityExpiration.ts"));
const now = new Date("2026-10-03T12:00:00Z");
const past = new Date("2026-08-01T00:00:00Z");
const future = new Date("2026-12-01T00:00:00Z");
const rec = (provider: string, status: string, deadline: Date | null) => ({
  providerName: provider, status, responseDeadline: deadline, title: "Occupational Health Services",
});
type S = { id: string; what: string; expectNotActive: boolean; run: () => string };
const stale: S[] = [
  { id: "stale01", what: "archived record rediscovered by SAME provider (past deadline)", expectNotActive: true,
    run: () => pr.mergeSourceRefresh(rec("samGov", "archived", past), rec("samGov", "active", past)).status },
  { id: "stale02", what: "archived samGov record rediscovered by LOWER-authority texasEsbd", expectNotActive: true,
    run: () => pr.mergeSourceRefresh(rec("samGov", "archived", past), rec("texasEsbd", "active", past)).status },
  { id: "stale03", what: "archived texasEsbd record rediscovered by HIGHER-authority samGov (past deadline)", expectNotActive: true,
    run: () => pr.mergeSourceRefresh(rec("texasEsbd", "archived", past), rec("samGov", "active", past)).status },
  { id: "stale04", what: "archived samGov record rediscovered by web search (langsearch)", expectNotActive: true,
    run: () => pr.mergeSourceRefresh(rec("samGov", "archived", past), rec("langsearch", "active", past)).status },
  { id: "stale05", what: "archived record, rediscovery has NO deadline (null), same provider", expectNotActive: true,
    run: () => pr.mergeSourceRefresh(rec("samGov", "archived", past), rec("samGov", "active", null)).status },
  { id: "stale06", what: "archived record rediscovered by higher-authority provider, FUTURE deadline (legitimately extended)", expectNotActive: false,
    run: () => pr.mergeSourceRefresh(rec("texasEsbd", "archived", past), rec("samGov", "active", future)).status },
  { id: "stale07", what: "expiration check: active record, deadline long past", expectNotActive: true,
    run: () => (ex.evaluateOpportunityExpiration(rec("samGov", "active", past) as any, now).expired ? "expired" : "active") },
  { id: "stale08", what: "expiration check: source status says awarded", expectNotActive: true,
    run: () => (ex.evaluateOpportunityExpiration({ ...rec("samGov", "active", future), rawData: { status: "Awarded" } } as any, now).expired ? "expired" : "active") },
  { id: "stale09", what: "expiration check: record with future deadline stays live", expectNotActive: false,
    run: () => (ex.evaluateOpportunityExpiration(rec("samGov", "active", future) as any, now).expired ? "expired" : "active") },
];
const staleRows = stale.map((s) => {
  const status = s.run();
  const active = status === "active";
  return { id: s.id, what: s.what, result: status, pass: s.expectNotActive ? !active : active };
});

// ---- 5. report
const out = { thresholds: { acceptMin, reviewMin }, rows, staleRows };
fs.writeFileSync(path.join(here, "results.json"), JSON.stringify(out, null, 1));
const groups = [...new Set(rows.map((r) => r.group))];
console.log(`thresholds accept_min=${acceptMin} review_min=${reviewMin}`);
for (const g of groups) {
  const gr = rows.filter((r) => r.group === g);
  const rv = gr.filter((r) => r.decision === "review").length;
  console.log(`\n## ${g}: ${gr.filter((r) => r.pass).length}/${gr.length} pass` + (rv ? `  (${rv} routed to adjudication/review)` : ""));
  for (const r of gr.filter((x) => !x.pass))
    console.log(`  FAIL ${r.id} expect=${r.expect} got=${r.decision} score=${r.score} layer=${r.layer} ${r.detail}`);
}
console.log(`\n## stale_expired: ${staleRows.filter((r) => r.pass).length}/${staleRows.length} pass`);
for (const r of staleRows) console.log(`  ${r.pass ? "PASS" : "FAIL"} ${r.id} -> ${r.result}  (${r.what})`);
const total = rows.length + staleRows.length;
const passed = rows.filter((r) => r.pass).length + staleRows.filter((r) => r.pass).length;
console.log(`\nTOTAL ${passed}/${total}`);
