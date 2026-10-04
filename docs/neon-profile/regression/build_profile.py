#!/usr/bin/env python3
"""Builds profile.json: the Neon relevance profile exactly as loaded on the test branch.
Sources are the migration files (content-checksum-verified against the branch) plus the
pre-existing Neon terms (neon_existing_terms.json, read from the branch). No vocabulary here."""
import json, re, os
here = os.path.dirname(os.path.abspath(__file__)); up = os.path.dirname(here)
def payload(path, pat):
    return json.loads(re.search(pat, open(os.path.join(up, path)).read(), re.S).group(1))
terms = payload('002_terms.sql', r'jsonb_array_elements\(\$j\$(\[\[.*?\]\])\$j\$::jsonb\) g')
# 007 adds terms as [type, strength, role, category, [phrases], meta]; reshape to the 002 group layout (source slot unused)
terms += [[g[0], g[1], g[2], g[3], None, g[4], g[5]] for g in payload('007_additional_terms.sql', r'jsonb_array_elements\(\$j\$(\[\[.*?\]\])\$j\$::jsonb\) g')]
rules = payload('003_rules.sql', r'\$j\$(\[.*\])\$j\$')
s4 = open(os.path.join(up, '004_facts_and_policies.sql')).read()
ms = list(re.finditer(r'\$j\$(\[.*?\])\$j\$', s4, re.S))
facts = json.loads(ms[0].group(1))
existing = json.load(open(os.path.join(here, 'neon_existing_terms.json')))
low = lambda t: re.sub(r'\s+', ' ', t.lower()).strip()
cats = {}
for f in facts:
    if f[1] == 'relevance_category':
        cats[f[2]] = dict(label=f[3], adjacentOnly=bool(f[4].get('adjacent_only')), explicit=[], component=[], regulatory=[])
P = dict(categories=cats, generalExplicit=[], regulatory=[], procurementSignals=[], workforceSignals=[],
         networkTerms=[], titleMedical=[], genericTitle=[], prime=[], rules=[], thresholds={}, networkCategory='network_program_management')
for ttype, strength, role, cat, _src, phrases, meta in terms:
    ph = [low(p) for p in phrases]
    if ttype == 'procurement_stage_signal': P['procurementSignals'] += ph
    elif ttype == 'workforce_signal': P['workforceSignals'] += ph
    elif ttype == 'delivery_network_term': P['networkTerms'] += ph
    elif ttype == 'title_signal': P['titleMedical' if role == 'title_medical' else 'genericTitle'] += ph
    elif ttype == 'buyer_sector_signal': P['prime'] += ph  # all buyer sector + prime terms (classifier treats both as prime signals)
    elif cat and cat in cats:
        if ttype == 'procurement_phrase' and strength == 'direct': cats[cat]['explicit'] += ph
        elif ttype == 'regulatory_reference': cats[cat]['regulatory'] += ph
        else: cats[cat]['component'] += ph  # component_term and review-strength procurement phrases
    elif ttype == 'regulatory_reference': P['regulatory'] += ph
    elif ttype == 'procurement_phrase' and strength == 'direct': P['generalExplicit'] += ph
    elif ttype == 'component_term': P['generalExplicit'] += []  # uncategorised review terms: not evidence on their own
P['generalExplicit'] += [low(p) for p in existing['direct_procurement_phrases'] if len(p) >= 8]
P['regulatory'] += [low(p) for p in existing['regulatory_references'] + existing['standard_references']]
for r in rules:
    P['rules'].append(dict(key=r[0], action=r[4], hard=r[5], priority=r[6], scope=r[7], triggers=[low(t) for t in r[8]]))
for f in facts:
    if f[1] == 'relevance_threshold': P['thresholds'][f[2]] = f[5]
for k in ('generalExplicit','regulatory','procurementSignals','workforceSignals','networkTerms','titleMedical','genericTitle','prime'):
    P[k] = sorted(set(P[k]))
for c in cats.values():
    for k in ('explicit','component','regulatory'): c[k] = sorted(set(c[k]))
json.dump(P, open(os.path.join(here, 'profile.json'), 'w'), indent=1)
print({k: (len(v) if isinstance(v, (list, dict)) else v) for k, v in P.items()})
