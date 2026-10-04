#!/usr/bin/env python3
"""Reconstructs the Neon rows (as they exist after 900_activate) from the migration files, plus the
pre-existing Neon terms. Emits:
  rows.json - TEST FIXTURE ONLY: the DB transport is mocked with exactly these rows. Nothing in the application
              reads it; the application has no embedded copy of the profile (see relevanceProfile.ts failure mode).
No vocabulary lives in this script: it only re-shapes what the migration files contain."""
import json, re, os
here = os.path.dirname(os.path.abspath(__file__)); up = os.path.dirname(here)
root = os.path.dirname(os.path.dirname(up))
def blocks(path):
    return [json.loads(m) for m in re.findall(r'\$j\$(\[.*?\])\$j\$', open(os.path.join(up, path)).read(), re.S)]
terms_payload = blocks('002_terms.sql')
# 002 holds [sources-name-list, payload] per chunk file; pick the group payload (list of lists with phrases list at index 5)
groups = [b for b in terms_payload if b and isinstance(b[0], list) and len(b[0]) >= 6 and isinstance(b[0][5], list)]
terms = []
for ttype, strength, role, cat, _src, phrases, meta in [g for blk in groups for g in blk]:
    for p in phrases:
        md = {"role": role, "migration": "relevance_vocabulary_20261003"}
        if cat: md["category"] = cat
        if isinstance(meta, dict): md.update(meta)
        terms.append(dict(phrase=p, term_type=ttype, match_strength=strength,
                          target_keys=([f"category:{cat}"] if cat else []), metadata=md, active=True))
# 007: additional inactive terms (same payload shape, phrases at index 4)
for blk in blocks('007_additional_terms.sql'):
    for ttype, strength, role, cat, phrases, meta in blk:
        for p in phrases:
            md = {"role": role, "migration": "relevance_vocabulary_20261003"}
            if cat: md["category"] = cat
            if isinstance(meta, dict): md.update(meta)
            terms.append(dict(phrase=p, term_type=ttype, match_strength=strength,
                              target_keys=([f"category:{cat}"] if cat else []), metadata=md, active=True))
existing = json.load(open(os.path.join(here, 'neon_existing_terms.json')))
for key, ttype, strength in (('direct_procurement_phrases','procurement_phrase','direct'),
                             ('review_procurement_phrases','procurement_phrase','review'),
                             ('regulatory_references','regulatory_reference','direct'),
                             ('standard_references','standard_reference','review')):
    for p in existing[key]:
        terms.append(dict(phrase=p, term_type=ttype, match_strength=strength, target_keys=[], metadata={}, active=True))
rules = []
for fn in ('003_rules.sql', '005_notice_wording_rules.sql'):
    for blk in blocks(fn):
        for r in blk:
            rules.append(dict(rule_key=r[0], category=r[1], title=r[2], rule_text=r[3], machine_action=r[4],
                              hard_rule=bool(r[5]), priority=r[6], scope=r[7], search_triggers=r[8], status='current'))
# 006 updates draft rules in place (same rule_key): later files override earlier rows
for blk in blocks('006_commodity_scope_rule.sql'):
    for r in blk:
        for i, old in enumerate(rules):
            if old['rule_key'] == r[0]:
                rules[i] = dict(rule_key=r[0], category=r[1], title=r[2], rule_text=r[3], machine_action=r[4],
                                hard_rule=bool(r[5]), priority=r[6], scope=r[7], search_triggers=r[8], status='current')
pre = json.load(open(os.path.join(here, 'neon_existing_rules_policies.json')))
for r in pre['rules']:
    rules.append(dict(rule_key=r['rule_key'], category=r['category'], title=r['title'], rule_text=r['rule_text'], machine_action=r['machine_action'],
                      hard_rule=r['hard_rule'], priority=r['priority'], scope=r['scope'], search_triggers=r['search_triggers'], status='current'))
b4 = blocks('004_facts_and_policies.sql')
facts = [dict(fact_key=f[0], category=f[1], predicate=f[2], value_text=f[3], value_json=(None if f[4] == 'null' else f[4]),
              value_numeric=f[5], status='current') for f in b4[0] if (f[3] is not None or f[4] is not None or f[5] is not None)]
policies = [dict(policy_key=p[0], applies_to=p[1], title=p[2], instruction=p[3], priority=p[4], must_follow=True) for p in b4[1]] + pre['policies']
rows = dict(terms=terms, rules=rules, facts=facts, policies=policies)
json.dump(rows, open(os.path.join(here, 'rows.json'), 'w'), indent=0)
print({k: len(v) for k, v in rows.items()})
