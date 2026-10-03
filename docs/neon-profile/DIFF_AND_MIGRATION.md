# Neon OCCU_MED_AWARE vs Insight-Hub hard-coded relevance: diff and migration (DRAFT, nothing applied)

Source of "what Neon has": production branch of project `OCCU_MED_AWARE` (`withered-credit-62316025`), read 2026-10-03 with read-only queries.
Source of "what code has": Insight-Hub `main` @ `1d6cec4`.

## 1. What Neon currently contains
| Table | Rows | Notes |
|---|---|---|
| `rfp_search_terms` | 58 | 43 direct procurement phrases, 3 review phrases, 11 CFR/regulatory references, 1 standard reference (NFPA 1582) |
| `rules` | 4 | not_tpa, workers_comp_excluded, direct_provider_preference, provider_documents_findings (all canonical hard rules) |
| `services` | 6 | EXAMQA, periodic surveillance, immunizations, fitness-for-duty, embassy clearance, deployment readiness |
| `service_capabilities` | 75 | 11 arrangeable, 64 documented baseline (CPT/CDT/vaccines/audiograms/fit tests...) |
| `agent_policies` | 11 | incl. IME-needs-employment-context, unlisted-service-is-not-excluded |
| `facts` (relevance-related) | NAICS 541612 + 6 more, PSC Q403/Q999 | no CPV, no discovery/capability codes |
| `industry_classifications` | 148 | public NAICS/sector of Occu-Med's CLIENTS (not discovery codes) |

Only part of this reaches the classifier today: just `rfp_search_terms` direct phrases (>= 8 chars). Rules, policies, capabilities and review phrases are prompt-only.

## 2. What code has that Neon lacks (term-level)
Code-side term occurrences checked: 1137. A term counts as covered only on an exact normalized match against a Neon phrase, capability name or rule trigger.

| Code list | Terms | Exact match in Neon | Partial overlap | Not in Neon |
|---|---|---|---|---|
| ontology | 891 | 26 | 64 | 801 |
| relevance.ts:PRIME_CONTRACTOR_SIGNALS(extras) | 18 | 0 | 0 | 18 |
| relevance.ts:titleHasMedical | 19 | 0 | 12 | 7 |
| relevance.ts:pathE generic title phrases | 5 | 0 | 0 | 5 |
| routes/opportunities.ts:OCCUMED_SERVICE_SIGNALS | 74 | 4 | 21 | 49 |
| internationalPublicPortals.ts:OCCUMED_SERVICE_TERMS | 16 | 3 | 6 | 7 |
| gemini.ts:OCCUMED_PROFILE.keywords | 17 | 3 | 7 | 7 |
| govconIntelligence.ts:POSITIVE_TERMS | 21 | 3 | 10 | 8 |
| routes/federal-intel.ts:scoreForecastItem | 17 | 2 | 7 | 8 |
| stateIntelligence.ts:SERVICE_PATTERNS | 13 | 1 | 6 | 6 |
| agencyForecastDiscovery.ts:OCCUMED_RE | 5 | 0 | 3 | 2 |
| contextualFeedback.ts:serviceScopes | 14 | 0 | 3 | 11 |
| localSearch.ts + opportunity-summary-v2.ts + routes/opportunities.ts (service-line label regexes) | 14 | 0 | 5 | 9 |
| govconIntelligence.ts:NEGATIVE_TERMS (exclusions) | 13 | 0 | 0 | 13 |

Migration inserts **1003** de-duplicated term rows (anything already exact in Neon is skipped), by type:

| Neon term_type | Rows |
|---|---|
| component_term | 382 |
| procurement_phrase | 333 |
| procurement_stage_signal | 62 |
| delivery_network_term | 62 |
| buyer_sector_signal | 57 |
| regulatory_reference | 46 |
| workforce_signal | 37 |
| title_signal | 24 |

Rows by code source:

| Source | Rows |
|---|---|
| occumedProcurementOntology.ts | 854 |
| routes/opportunities.ts | 50 |
| relevance.ts | 42 |
| govconIntelligence.ts | 12 |
| contextualFeedback.ts | 12 |
| internationalPublicPortals.ts | 7 |
| stateIntelligence.ts | 7 |
| localSearch.ts | 7 |
| gemini.ts | 6 |
| routes/federal-intel.ts | 5 |
| agencyForecastDiscovery.ts | 1 |

## 3. Non-term material migrated
**Rules (22, status `draft`)**

| rule_key | category | kind | triggers | from |
|---|---|---|---|---|
| rv_notice_not_procurement | notice_type | hard | 29 | ontology.HARD_REJECT_TERMS + routes/opportunities.ts.HARD_REJECT_SIGNALS |
| rv_notice_post_award | notice_status | hard | 20 | ontology.HARD_REJECT_TERMS + routes/opportunities.ts.HARD_REJECT_SIGNALS |
| rv_out_of_scope_health_it | service_scope | hard | 6 | ontology.HARD_REJECT_TERMS + routes/opportunities.ts.HARD_REJECT_SIGNALS |
| rv_out_of_scope_non_occupational | service_scope | hard | 14 | ontology.HARD_REJECT_TERMS + routes/opportunities.ts.HARD_REJECT_SIGNALS |
| rv_non_medical_primary_scope | service_scope | hard | 31 | relevance.ts.NON_MEDICAL_PRIMARY_SCOPE_RE + structuredOpportunityJudge prompt (surveillance cameras, toilets, weapons) |
| rv_cond_ohs_safety_only | service_scope | conditional/structural | 7 | ontology.CONDITIONAL_NEGATIVE_GROUPS.ohs_safety_only |
| rv_cond_background_only | service_scope | conditional/structural | 9 | ontology.CONDITIONAL_NEGATIVE_GROUPS.background_only |
| rv_cond_drug_adjacent | service_scope | conditional/structural | 9 | ontology.CONDITIONAL_NEGATIVE_GROUPS.drug_adjacent |
| rv_cond_employee_benefits | service_scope | conditional/structural | 7 | ontology.CONDITIONAL_NEGATIVE_GROUPS.employee_benefits |
| rv_cond_medical_screening_nonworkforce | service_scope | conditional/structural | 5 | ontology.CONDITIONAL_NEGATIVE_GROUPS.medical_screening_nonworkforce |
| rv_cond_incidental_requirement | service_scope | conditional/structural | 4 | ontology.CONDITIONAL_NEGATIVE_GROUPS.incidental_requirement |
| rv_cond_supplies_only | service_scope | conditional/structural | 6 | ontology.CONDITIONAL_NEGATIVE_GROUPS.supplies_only |
| rv_cond_treatment_staffing_only | service_scope | conditional/structural | 51 | routes/opportunities.ts.HARD_REJECT_SIGNALS |
| rv_benefit_adjudication | service_scope | hard | 6 | routes/opportunities.ts.HARD_REJECT_SIGNALS |
| rv_program_surveillance_lead_asbestos_silica | program_combination | conditional/structural | 0 | relevance.ts.regulatoryProgram |
| rv_program_hearing_conservation_audiometry | program_combination | conditional/structural | 0 | relevance.ts.regulatoryProgram |
| rv_program_respiratory_medical_clearance | program_combination | conditional/structural | 0 | relevance.ts.regulatoryProgram |
| rv_program_nfpa_1582_exam | program_combination | conditional/structural | 0 | relevance.ts.regulatoryProgram |
| rv_program_dot_part_40_collection | program_combination | conditional/structural | 0 | relevance.ts.regulatoryProgram |
| rv_program_centcom_medical_screening | program_combination | conditional/structural | 0 | relevance.ts.regulatoryProgram |
| rv_program_job_functions_medical_exam | program_combination | conditional/structural | 0 | relevance.ts.regulatoryProgram |
| rv_cond_unrelated_procurement | service_scope | conditional/structural | 7 | govconIntelligence.ts.NEGATIVE_TERMS |

**Facts (74, status `draft`)**: 15 relevance categories (label, adjacent-only flag, proposed mapping to Neon services); 39 discovery codes with tier/rationale/semantic phrases (12 NAICS + 21 PSC from the SAM taxonomy, Q403 for its semantic phrases, CPV 85147000, NAICS 621310, prefixes 621/5613/541); 9 search bundles; 8 existing score thresholds (carried over unchanged); target buyer types; forecast target agencies; high-propensity buyer sectors.

**Agent policies (5, `active=false`)**: primary-purchased-scope judging, realistic-bid test, semantic equivalents, unrelated-purchase examples, and one NEW policy for commodity/raw-material/equipment supply (written from your regression requirement, not from code; flagged `new_not_from_code`).

## 4. Neon phrases with no exact code equivalent (already in Neon, nothing to migrate)
- Annual medical examinations
- Asbestos surveillance examinations
- DOT oral fluid drug testing
- DOT physical examination
- DOT urine drug testing
- Embassy medical clearance examination
- Employment visa medical examination
- Fitness-for-duty examinations
- HAZWOPER medical surveillance
- Heavy metal testing
- Kuwait visa medical examination
- Lead medical surveillance
- Medical Examiner's Certificate
- Medical fitness-for-duty evaluation
- Medical qualification determinations
- Non-DOT oral fluid drug testing
- Non-DOT urine drug testing
- OSHA medical screening and surveillance
- Occupational health medical surveillance
- Oral fluid drug testing
- Periodic medical examinations
- Post-exposure evaluation and follow-up
- Pre-assignment medical examinations
- Pre-employment physical examinations
- Pre-placement medical examinations
- Psychological evaluation
- Return-to-work clearance
- Return-to-work medical evaluation
- Saudi visa medical examination
- Urine drug testing
- IME
- Independent medical evaluation
- NFPA 1582 physicals
- 14 CFR Part 67
- 29 CFR 1910.1001
- 29 CFR 1910.1025
- 29 CFR 1910.1030
- 29 CFR 1910.1053
- 29 CFR 1910.120
- 29 CFR 1910.134
- 29 CFR 1910.95
- 49 CFR 391.41-391.49
- 5 CFR Part 339
- NFPA 1582

## 5. Deliberately NOT migrated
| Item | Where | Why |
|---|---|---|
| `needed`, ` hiring `, `seaborn` | routes/opportunities.ts hard-reject | `needed` rejects ordinary text ("Services needed - employee physicals" is hidden today even though the classifier accepts it); `seaborn` is a scraped-page artifact. |
| `we are looking for` | routes/opportunities.ts | Common in legitimate RFP intros. |
| `blanket purchase agreement` | routes/opportunities.ts hard-reject | A valid contract vehicle; the ontology treats it as a positive procurement signal. |
| `construction` as unconditional reject | routes/opportunities.ts | Already covered by title-scoped `rv_non_medical_primary_scope` with a service-term rescue. |
| NAICS 561320, 621610, 621910, 621420, 561612, 611519 | usaSpending.ts, federal-intel.ts | Used for incumbent/award intelligence, not opportunity relevance; 621910 (ambulance) and 621420 (EAP) contradict current scope, 561612 is security guards. Say the word if you want any added as `secondary-adjacent`. |
| Per-portal `occumedFit` verdicts | directRfpPortalRelevanceCatalog.ts | Evidence about specific portals (source verification data), not vocabulary. Only its high-propensity sector set is migrated. |
| USAJobs vocabulary | usaJobsIntelligence.ts | USAJobs is not a Hub 1 dependency. |
| `scoring.ts` | search/scoring.ts | Dead code, no vocabulary. Delete in cleanup. |

## 6. Stays in code (data-quality, not Occu-Med relevance)
Date parsing/stale-year handling, expiration and closed-status detection (`opportunityExpiration.ts`), deduplication/identity, source-authority ranking, aggregator/job-board/social domain blocklists (`BLOCKED_DOMAINS`, `AGGREGATOR_HOSTS`, `SOFT_PENALTY_TERMS`), forecast-notice detection regex, provider API parameters and parsers, and the classifier's evidence-combination mechanics (path A-E and score arithmetic). Post-award notice TEXT triggers are in Neon (`rv_notice_post_award`) only so the classifier keeps its current behavior; the quality layer's own status checks remain.

## 7. Decisions I need from you
1. **Treatment/staffing/EMS/dental/psychiatric terms**: the read-time gate rejected them unconditionally. Neon's own policy and capabilities (CDT dental exams, psychological assessment, venipuncture, NFPA 1582) say an unlisted service is not excluded, so I migrated them as one *conditional* rule (`rv_cond_treatment_staffing_only`): reject only when no occupational-exam evidence is present. Confirm, or tell me which terms should be unconditional.
2. **Thresholds**: the 8 gate thresholds disagree (e.g. multiScorer 55/50, judge 68/76, decision 72/78/82). I stored them as-is. Pick one set for the single gate.
3. **Forecast/recompete scoring** (`govconIntelligence.ts`) has per-term weights. I kept the weights in term metadata, but recommend replacing it with the shared classifier like opportunities.
4. **`rv_commodity...` policy** is new wording. Keep, edit, or drop.
5. **Authority level**: everything migrated is `internal_research` (rank 60) so your canonical rules still win any conflict. Promote selected rows to `canonical` after review.

## 8. Safety and apply order
All inserted rows are inactive (`rfp_search_terms.active=false`, `rules.status='draft'`, `facts.status='draft'`, `agent_policies.active=false`), so the running app sees no change. The only schema change is widening the `term_type` check on `rfp_search_terms`.

1. `001_ddl_and_provenance.sql`, `002_terms.sql`, `003_rules.sql`, `004_facts_and_policies.sql`: load inactive.
2. Review in Neon.
3. `900_activate.sql`: flips them live in one transaction.
4. `999_rollback.sql`: removes only rows carrying this migration's source tag (not run automatically).

Expected counts after load: terms 1003, rules 22, facts 74, policies 5, terms checksum `41d0f50cc6a2e353219adc0d99709d4c`.

## 9. After approval (code changes, one consumer group at a time)
Loader reads the new term types, rule scope/triggers, facts and policies; the classifier consumes them instead of `occumedProcurementOntology.ts`; judges/extractors/scorer prompts take their scope text from policies; Tango/SAM/TED/USAspending/forecast code takes codes and agencies from the discovery-code and target-agency facts; UI service-line chips come from `relevance_category` facts and matched categories; read-time gate and duplicate lists are deleted last, each removal verified by the provider-parity and stale-record regression tests.

## 10. Branch validation (test branch `br-wild-king-b4nlew5y`, not production)

- 001 applied; 002 applied in 5 chunks: 1003 term rows, checksum `41d0f50cc6a2e353219adc0d99709d4c` matches, all inactive, pre-existing 58 active terms unchanged.
- 003 applied: 22 rules, all `draft`; `v_current_rules` still returns the original 4.
- Bug found and fixed by validation: in 002, `coalesce(g->6,'{}')` treated JSON `null` as a value, so metadata became an array for 934 rows. Now `case when jsonb_typeof(g->6)='object' ...`.
- 004 (facts/policies) NOT yet loaded on the branch. Constraints checked: fact_key unique (74), priorities 0-100, status `draft` allowed, no category CHECK.

## 11. Owner decisions applied (2026-10-03)

1. **Staffing:** `rv_cond_treatment_staffing_only` removed. New hard rule `rv_staffing_labor_supply` rejects staffing/locum/clinical labor supply/ambulance operations as the purchased service. Bare nurse/EMT/paramedic/firefighter/first responder are not triggers (they identify the served workforce). Remaining non-staffing treatment/plan terms stay conditional as `rv_cond_treatment_plan_admin`. Review terms "clinical staffing" and "health-unit staffing" dropped from terms.
2. **Thresholds:** the 8 legacy thresholds are not migrated. Two canonical facts defined once: `relevance.accept_min`=72, `relevance.review_min`=55. These are initial values to calibrate with the regression probe set before activation; all other hard-coded thresholds are removed in the consumer refactor.
3. **GovCon:** uses the shared Neon-backed logic. Useful weights live only as `govcon_weight` term metadata; the penalty map is in rule scope `rv_cond_unrelated_procurement`. No separate GovCon weighting survives the refactor.
4. **Commodity/equipment supply:** new canonical rule `rv_commodity_raw_material_supply` (title-scoped), kept alongside policy `rfp_commodity_and_equipment_supply`.
5. **Authority:** `900_activate.sql` now also sets `authority_level='canonical'`.

Expected counts now: terms 1001 (checksum `4aa4e1cec238d6da2573fb1fae2157e0`, verified on branch), rules 24, facts 68, policies 5. Activation tested on the branch: 1059 active terms, 28 current rules, all canonical.

## 12. Test-branch completion (all of 001-004 loaded, then activated on the branch only)

Branch state matches the files byte-for-byte by checksum: terms 1002, rules 24, facts 68, policies 5 (see `expected_counts.json`). Branch after activation: 1060 active terms, 28 current rules, 86 current facts, 16 active policies, all migrated rows canonical.

**Fact count 74 -> 68:** the 8 legacy `relevance_threshold` facts were removed and 2 canonical ones added (74 - 8 + 2 = 68). Verified by key-diff of the two committed versions of 004; no other fact changed.

**Defects found by the regression suite and fixed in the data (not in code):**
1. Migration loosened acceptance. 93 bare phrases migrated from ranking/search vocabularies (gemini keywords, GovCon, route gate, state/forecast patterns) were `direct`, so a news item, an N95-mask purchase, a vaccine purchase and an audiometer purchase were accepted; the unmodified classifier rejects all of them. Those phrases are now `review`; `direct` is limited to phrases already direct in the app's ontology or already direct in Neon (`regression/demote_loose_direct.py`).
2. `rv_staffing_labor_supply` contained the trigger "nursing staff", which matched the workforce being served ("Employee Health Services for Nursing Staff"). Removed.
3. Added review term "medical surveillance" (anchor of the surveillance program rules) so a title like "Fuel Handler Medical Surveillance Services" is rescued from the commodity title rule.

**Calibrated thresholds:** accept_min 70, review_min 45 (`regression/CALIBRATION.md`). review_min is a cost/recall tradeoff flagged for owner confirmation.

**Regression suite** (`regression/run_regression.mts`, 105 relevance cases + 9 stale/expired): 108/114... see section 13 for the final table.

## 13. Final regression table and activation caveat

(See the conversation summary; the machine-readable output is `regression/results.json`.)

**Activation must wait for the loader refactor.** The current loader (`occumedAware/loader.ts`) reads every active `rfp_search_terms` row, caps classifier phrases at 200 (`setProfileDirectPhrases`, ordered alphabetically by SQL) and caps prompt rules/policies at 20/12 by priority. Activating now would push 270 direct phrases through the 200 cap and drop about 15 curated Neon phrases (for example "spirometry", "urine drug testing", "pulmonary function testing"), and crowd the prompt rule list. Apply 001-004 (inactive/draft, no behavior change) first; run 900 together with the loader/consumer refactor.
