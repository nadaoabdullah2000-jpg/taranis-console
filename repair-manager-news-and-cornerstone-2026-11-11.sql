-- 11 Nov 2026 (decided by research@taranis.net, from the Opportunities audit):
--  * Rejected as manager news (a person's decision): 2685 "Unidentified: HF backers" (with its copies
--    2674, 2314), 2175 "Unidentified: firm simplifying HF subscriptions", 2019 Y Street, 1969 Soros
--    Fund Management (with its copies 1965, 1960). 2684 Stable Asset Management (a seeder) is kept.
--  * 3029 "Direct lending on horizon for Cornerstone" (a headline stored as the name) merged into 3067
--    Cornerstone Alternatives the usual way.
-- ONE transaction. Nothing deleted. Backup: wi_mandates_backup_20261111_mgrnews. Logged in wi_fill_log.

begin;
create table wi_mandates_backup_20261111_mgrnews as
  select id, qualification, new_qualification, new_fit_score, fit_reason, hard_fail_reasons, verdict_source, verdict_set_by,
         verdict_set_at, approved_at, approved_by, validation_status, merged_into, evidence, intention_summary
    from wi_mandates where id in (2685, 2674, 2314, 2175, 2019, 1969, 1965, 1960, 3029, 3067);

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Verdict', concat_ws(' ', coalesce(new_qualification, qualification), coalesce(new_fit_score::text, '-')), 'rejected 0',
       'Rejected 11 Nov 2026 (decided by research@taranis.net): Not an allocator; manager news'
  from wi_mandates where id in (2685, 2674, 2314, 2175, 2019, 1969, 1965, 1960);

update wi_mandates
   set qualification = 'rejected', new_qualification = 'rejected', new_fit_score = 0,
       fit_reason = 'Not an allocator: manager news.',
       hard_fail_reasons = '["Not an investor mandate - manager news (decided by a person)"]'::jsonb,
       verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now(),
       approved_at = null, approved_by = null
 where id in (2685, 2674, 2314, 2175, 2019, 1969, 1965, 1960);

-- 3029 into 3067
update wi_mandates k set
  evidence = (case when jsonb_typeof(k.evidence) = 'object' then k.evidence else '{}'::jsonb end)
             || jsonb_build_object('merged_rows', coalesce(k.evidence -> 'merged_rows', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                  'id', m.id, 'summary', m.intention_summary, 'tag', m.investor_tag, 'intention_url', m.view_intention_url,
                  'article_url', m.view_article_url, 'alert_date', m.alert_date, 'verdict', coalesce(m.new_qualification, m.qualification),
                  'score', m.new_fit_score, 'approved_at', m.approved_at, 'approved_by', m.approved_by,
                  'source_message_id', m.source_message_id))),
  intention_summary = case when btrim(coalesce(m.intention_summary, '')) <> '' and btrim(m.intention_summary) is distinct from btrim(coalesce(k.intention_summary, ''))
                           then concat_ws(' • ', k.intention_summary, m.intention_summary) else k.intention_summary end
  from wi_mandates m where k.id = 3067 and m.id = 3029;
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Merged into row', coalesce(validation_status, ''), '3067',
       'Merge 11 Nov 2026 (decided by research@taranis.net): same investor (Cornerstone Alternatives; the name was a headline)'
  from wi_mandates where id = 3029;
update wi_mandates set validation_status = 'merged', merged_into = 3067 where id = 3029;
update iconnections_import_rows set matched_id = 3067 where matched_id = 3029;
commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--          new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, hard_fail_reasons = b.hard_fail_reasons,
--          verdict_source = b.verdict_source, verdict_set_by = b.verdict_set_by, verdict_set_at = now(),
--          approved_at = b.approved_at, approved_by = b.approved_by, validation_status = b.validation_status,
--          merged_into = b.merged_into, evidence = b.evidence, intention_summary = b.intention_summary
--     from wi_mandates_backup_20261111_mgrnews b where b.id = m.id;
--   commit;
