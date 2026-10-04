-- 007: three Occu-Med phrases found missing from Neon by the old-vs-Neon comparison (approved 2026-10-04).
-- Inserted INACTIVE like 002, tagged with the same migration marker so 900_activate.sql activates them with the rest.
-- USAJOBS / grants / OPM-series phrases from the old code are intentionally not migrated (not procurement-relevance terms).
begin;
with src as (select id from occumed_core.source_documents where source_key='insight_hub_relevance_vocabulary_20261003'),
payload as (select g from jsonb_array_elements($j$[["procurement_phrase","direct","explicit","occupational_employee_medical",["employee health screening"],{}],["procurement_phrase","direct","explicit","public_safety_medical",["police physical","public safety medical exams"],{}]]$j$::jsonb) g),
ins as (
  insert into occumed_core.rfp_search_terms (term_key, phrase, term_type, target_keys, match_strength, authority_level, active, notes, metadata)
  select 'rv_'||(g->>2)||'_'||left(trim(both '_' from regexp_replace(lower(p.phrase),'[^a-z0-9]+','_','g')),40)||'_'||substr(md5((g->>0)||'|'||coalesce(g->>3,'')||'|'||p.phrase),1,6),
         p.phrase, g->>0,
         case when g->>3 is null then '{}'::text[] else array['category:'||(g->>3)] end,
         g->>1, 'internal_research', false,
         'Added by migration 007 (missing from Neon vs. legacy code vocabulary)',
         jsonb_strip_nulls(jsonb_build_object('role',g->>2,'category',g->>3,'migrated_from','007_additional_terms','migration','relevance_vocabulary_20261003') || case when jsonb_typeof(g->5)='object' then g->5 else '{}'::jsonb end)
  from payload, jsonb_array_elements_text(g->4) as p(phrase)
  where not exists (select 1 from occumed_core.rfp_search_terms t where lower(t.phrase)=lower(p.phrase) and t.term_type=g->>0)
  returning id
)
insert into occumed_core.rfp_search_term_sources (term_id, source_id) select ins.id, src.id from ins, src;
-- expected: 3 rows inserted (0 if re-run)
commit;
