#!/usr/bin/env python3
"""Rewrite 002_terms.sql so that migration never LOOSENS acceptance evidence.
Direct (acceptance-grade) procurement phrases are kept only if they were already direct evidence in
the app (ontology SERVICE_CATEGORIES explicit phrases) or already direct in Neon. Phrases that came from
ranking/search/label vocabularies become review-strength component evidence. Also adds the anchor term
'medical surveillance' (used by the regulatory-program rules) as review evidence.
Prints the term_keys whose strength changed (for the test-branch UPDATE)."""
import re, json, hashlib, os, sys
here = os.path.dirname(os.path.abspath(__file__)); up = os.path.dirname(here)
p = os.path.join(up, '002_terms.sql'); s = open(p).read()
m = re.search(r'jsonb_array_elements\(\$j\$(\[\[.*?\]\])\$j\$::jsonb\) g', s, re.S); pl = json.loads(m.group(1))
ms = re.search(r'jsonb_array_elements_text\(\$j\$(\[.*?\])\$j\$::jsonb\) with ordinality', s, re.S); srcs = json.loads(ms.group(1))
low = lambda t: re.sub(r'\s+', ' ', t.lower()).strip()
onto_src = {i for i, n in enumerate(srcs) if n.startswith('occumedProcurementOntology.SERVICE_CATEGORIES.')}
keep = {low(ph) for g in pl if g[4] in onto_src for ph in g[5]}
keep |= {low(x) for x in json.load(open(os.path.join(here, 'neon_existing_terms.json')))['direct_procurement_phrases']}
md = lambda x: hashlib.md5(x.encode()).hexdigest()
def key(g, ph):
    slug = re.sub(r'[^a-z0-9]+', '_', ph.lower()).strip('_')[:40]
    return 'rv_%s_%s_%s' % (g[2], slug, md('|'.join([g[0], g[3] or '', ph]))[:6])
out, changed = [], []
for g in pl:
    if g[0] == 'procurement_phrase' and g[1] == 'direct' and g[4] not in onto_src:
        stay = [ph for ph in g[5] if low(ph) in keep]; dem = [ph for ph in g[5] if low(ph) not in keep]
        if stay: out.append(g[:5] + [stay] + g[6:])
        if dem:
            out.append([g[0], 'review'] + g[2:5] + [dem] + g[6:]); changed += [key(g, ph) for ph in dem]
    else: out.append(g)
if 'relevance.ts.regulatoryProgram' not in srcs: srcs.append('relevance.ts.regulatoryProgram')
si = srcs.index('relevance.ts.regulatoryProgram')
out.append(['component_term', 'review', 'component', 'medical_surveillance', si, ['medical surveillance'], None])
s = s[:m.start(1)] + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + s[m.end(1):]
ms = re.search(r'jsonb_array_elements_text\(\$j\$(\[.*?\])\$j\$::jsonb\) with ordinality', s, re.S)
s = s[:ms.start(1)] + json.dumps(srcs, ensure_ascii=False) + s[ms.end(1):]
s = s.replace('1001 rows', '1002 rows'); open(p, 'w').write(s)
json.dump(changed, open(os.path.join(here, 'demoted_keys.json'), 'w'), indent=0)
print('demoted', len(changed), 'kept direct', sum(len(g[5]) for g in out if g[0]=='procurement_phrase' and g[1]=='direct'))
