-- 11 Nov 2026 (decided by research@taranis.net): rows 3037 and 3047 are both "Seidor founding family's
-- new CIO". 3037 is merged into 3047 the usual way: the keeper carries the merged row in
-- evidence.merged_rows, 3037 becomes validation_status 'merged' with merged_into = 3047, I-Connections
-- rows pointing at 3037 now point at 3047. 3047 keeps its Matched verdict set by a person.
-- ONE transaction. Nothing deleted. Backup: wi_mandates_backup_20261111_seidor. Logged in wi_fill_log.

begin;
create table wi_mandates_backup_20261111_seidor as
  select id, validation_status, merged_into, evidence, intention_summary, new_qualification, new_fit_score, verdict_source
    from wi_mandates where id in (3037, 3047);

update wi_mandates k set
  evidence = (case when jsonb_typeof(k.evidence) = 'object' then k.evidence else '{}'::jsonb end)
             || jsonb_build_object('merged_rows', coalesce(k.evidence -> 'merged_rows', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                  'id', m.id, 'summary', m.intention_summary, 'tag', m.investor_tag, 'intention_url', m.view_intention_url,
                  'article_url', m.view_article_url, 'alert_date', m.alert_date, 'verdict', coalesce(m.new_qualification, m.qualification),
                  'score', m.new_fit_score, 'approved_at', m.approved_at, 'approved_by', m.approved_by,
                  'source_message_id', m.source_message_id))),
  intention_summary = case when btrim(coalesce(m.intention_summary, '')) <> '' and btrim(m.intention_summary) is distinct from btrim(coalesce(k.intention_summary, ''))
                           then concat_ws(' • ', k.intention_summary, m.intention_summary) else k.intention_summary end
  from wi_mandates m where k.id = 3047 and m.id = 3037;

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Merged into row', coalesce(validation_status, ''), '3047',
       'Merge 11 Nov 2026 (decided by research@taranis.net): same investor (Seidor founding family''s new CIO)'
  from wi_mandates where id = 3037;

update wi_mandates set validation_status = 'merged', merged_into = 3047 where id = 3037;
update iconnections_import_rows set matched_id = 3047 where matched_id = 3037;
commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set validation_status = b.validation_status, merged_into = b.merged_into,
--          evidence = b.evidence, intention_summary = b.intention_summary
--     from wi_mandates_backup_20261111_seidor b where b.id = m.id;
--   commit;
