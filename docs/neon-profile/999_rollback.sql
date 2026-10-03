-- 999: ROLLBACK of everything inserted by this migration (touches only rows tagged with its source). Not run automatically.
begin;
delete from occumed_core.rfp_search_terms where metadata->>'migration'='relevance_vocabulary_20261003';
delete from occumed_core.rules where rule_key like 'rv\_%' and source_id=(select id from occumed_core.source_documents where source_key='insight_hub_relevance_vocabulary_20261003');
delete from occumed_core.facts where source_id=(select id from occumed_core.source_documents where source_key='insight_hub_relevance_vocabulary_20261003');
delete from occumed_core.agent_policies where source_id=(select id from occumed_core.source_documents where source_key='insight_hub_relevance_vocabulary_20261003');
delete from occumed_core.source_documents where source_key='insight_hub_relevance_vocabulary_20261003';
alter table occumed_core.rfp_search_terms drop constraint rfp_search_terms_term_type_check;
alter table occumed_core.rfp_search_terms add constraint rfp_search_terms_term_type_check check (term_type = any (array['procurement_phrase','regulatory_reference','standard_reference']));
commit;
