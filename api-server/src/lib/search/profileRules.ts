/**
 * Rule engine for the Neon relevance profile.
 *
 * Interprets the rules stored in Neon (`machine_action`, `scope`, `search_triggers`). It contains no
 * vocabulary: every trigger, rescue term, penalty and program combination comes from the rule rows.
 *
 * Matching conventions (documented in the rule scopes):
 *   - triggers (things that reject or penalise) match whole words/phrases, so "fuel" does not fire on "refuel";
 *   - evidence and rescue lists (requires_one_of, all_of groups, service terms) match from a word start, so
 *     "physical" is satisfied by "physicals" and "examination" by "examinations".
 */
import type { ProfileRule, RelevanceProfile } from "./relevanceProfile";

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cache = new Map<string, RegExp>();

function triggerRegex(term: string): RegExp {
  const key = `t:${term}`;
  let re = cache.get(key);
  if (!re) {
    const s = term.trim();
    re = new RegExp((/^\w/.test(s) ? "\\b" : "") + esc(s) + (/\w$/.test(s) ? "\\b" : ""), "i");
    cache.set(key, re);
  }
  return re;
}
function evidenceRegex(term: string): RegExp {
  const key = `e:${term}`;
  let re = cache.get(key);
  if (!re) {
    const s = term.trim();
    re = new RegExp((/^\w/.test(s) ? "\\b" : "") + esc(s), "i");
    cache.set(key, re);
  }
  return re;
}

/** Terms from `terms` found in `text`, as whole words/phrases. */
export function matchTriggers(text: string, terms: readonly string[]): string[] {
  return terms.filter((t) => t && triggerRegex(t).test(text));
}
/** Terms from `terms` found in `text`, matching from a word start. */
export function matchEvidence(text: string, terms: readonly string[]): string[] {
  return terms.filter((t) => t && evidenceRegex(t).test(text));
}

export interface RuleContext {
  title: string;
  /** title + snippet + description */
  haystack: string;
  hasProcurementSignal: boolean;
}
export interface RuleHardReject {
  ruleKey: string;
  action: string;
  trigger: string;
  reason: string;
}
export interface RuleEvaluation {
  hardReject: RuleHardReject | null;
  /** Conditional false-positive penalty and the signals that caused it. */
  conditionalPenalty: number;
  negativeSignals: string[];
  /** Soft penalties (informational / job-title wording). */
  softPenalties: Array<{ ruleKey: string; trigger: string; penalty: number; reason: string }>;
  /** Program-combination rules satisfied by the notice. */
  programMatches: Array<{ ruleKey: string; title: string }>;
  /** Managed-delivery/network scope is accompanied by evidence of an actual service (rule network_requires_service_evidence). */
  networkServiceEvidence: boolean;
}

const NOTICE_REJECT_ACTIONS = new Set(["reject_not_a_procurement", "reject_post_award_notice", "reject_as_out_of_scope"]);

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase()) : [];
}
function penaltyFor(rule: ProfileRule, hits: string[]): number {
  const map = rule.scope.penalties as Record<string, number> | undefined;
  if (map && typeof map === "object") return Math.max(0, ...hits.map((h) => Number(map[h] ?? 0)));
  return Number(rule.scope.penalty ?? 0);
}

export function evaluateRules(profile: RelevanceProfile, ctx: RuleContext): RuleEvaluation {
  const out: RuleEvaluation = { hardReject: null, conditionalPenalty: 0, negativeSignals: [], softPenalties: [], programMatches: [], networkServiceEvidence: false };
  const titleService = () => matchEvidence(ctx.title, profile.allServiceTerms);
  for (const rule of profile.rules) {
    switch (rule.action) {
      case "reject_not_a_procurement":
      case "reject_post_award_notice":
      case "reject_as_out_of_scope": {
        if (out.hardReject) break;
        const hit = matchTriggers(ctx.haystack, rule.triggers)[0];
        if (hit)
          out.hardReject = {
            ruleKey: rule.key,
            action: rule.action,
            trigger: hit,
            reason: `Excluded due to Occu-Med rule "${rule.title}" ("${hit}")`,
          };
        break;
      }
      case "reject_when_title_scope_non_medical": {
        if (out.hardReject) break;
        const hit = matchTriggers(ctx.title, rule.triggers)[0];
        if (hit && titleService().length === 0)
          out.hardReject = {
            ruleKey: rule.key,
            action: rule.action,
            trigger: hit,
            reason: "Primary purchased scope is non-medical work; medical wording is incidental boilerplate",
          };
        break;
      }
      case "conditional_reject_unless_service_evidence": {
        const hits = matchTriggers(ctx.haystack, rule.triggers);
        if (hits.length && matchEvidence(ctx.haystack, stringList(rule.scope.requires_one_of)).length === 0) {
          out.negativeSignals.push(`${rule.key}: ${hits.join(", ")}`);
          out.conditionalPenalty += penaltyFor(rule, hits);
        }
        break;
      }
      case "penalize_informational_notice":
      case "penalize_job_title_wording": {
        if (rule.scope.unless === "procurement_signal_present" && ctx.hasProcurementSignal) break;
        const text = rule.scope.match === "title_any_trigger" ? ctx.title : ctx.haystack;
        const hit = matchTriggers(text, rule.triggers)[0];
        if (hit) out.softPenalties.push({ ruleKey: rule.key, trigger: hit, penalty: Number(rule.scope.penalty ?? 0), reason: rule.title });
        break;
      }
      case "accept_program_combination": {
        const groups = Array.isArray(rule.scope.all_of) ? (rule.scope.all_of as unknown[]) : [];
        if (groups.length && groups.every((g) => matchEvidence(ctx.haystack, stringList(g)).length > 0))
          out.programMatches.push({ ruleKey: rule.key, title: rule.title });
        break;
      }
      case "network_requires_service_evidence":
        if (matchEvidence(ctx.haystack, stringList(rule.scope.requires_one_of)).length > 0) out.networkServiceEvidence = true;
        break;
      default:
        break;
    }
  }
  return out;
}
