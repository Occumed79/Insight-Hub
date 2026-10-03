-- 900: ACTIVATE (run only after approval). Flips every row this migration inserted from draft/inactive to live.
begin;
update occumed_core.rfp_search_terms set active=true, updated_at=now() where metadata->>'migration'='relevance_vocabulary_20261003';
update occumed_core.rules set status='current' where rule_key like 'rv\_%' and status='draft';
update occumed_core.facts set status='current' where source_id=(select id from occumed_core.source_documents where source_key='insight_hub_relevance_vocabulary_20261003') and status='draft';
update occumed_core.agent_policies set active=true where source_id=(select id from occumed_core.source_documents where source_key='insight_hub_relevance_vocabulary_20261003');
commit;
