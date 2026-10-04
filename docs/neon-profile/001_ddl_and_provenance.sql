-- 001: widen rfp_search_terms.term_type + register provenance. Safe to run on production: adds an allowed value set, inserts one source row. No existing row changes.
begin;
alter table occumed_core.rfp_search_terms drop constraint rfp_search_terms_term_type_check;
alter table occumed_core.rfp_search_terms add constraint rfp_search_terms_term_type_check
  check (term_type = any (array['procurement_phrase','regulatory_reference','standard_reference',
    'component_term','workforce_signal','procurement_stage_signal','delivery_network_term','buyer_sector_signal','title_signal']));
insert into occumed_core.source_documents (source_key,title,source_type,origin,authority_level,source_url,source_date,ingestion_status,notes,metadata)
values ('insight_hub_relevance_vocabulary_20261003','Insight-Hub hard-coded relevance vocabulary (audit 2026-10-03)','code_vocabulary_audit','repository','internal_research',
  'https://github.com/Occumed79/Insight-Hub/tree/1d6cec4739155fab8196bccc038a8e26c7aa09d5','2026-10-03','seeded',
  'Terms, exclusions, codes and thresholds lifted from application code so Neon is the single relevance authority. Rows start INACTIVE (draft) until approved.',
  '{"repo":"Occumed79/Insight-Hub","commit":"1d6cec4739155fab8196bccc038a8e26c7aa09d5"}'::jsonb)
on conflict (source_key) do nothing;
commit;
