-- 10 Nov 2026 (decided by research@taranis.net). ONE transaction. Nothing deleted.
-- * The long/short-from-the-mandate-only rule was NOT adopted; the current rule (app.js on main)
--   stays. For consistency, 768 Iowa PERS, 1358 Andrew Carnegie Foundation, 1375 Wyoming RS and
--   1380 TRS Texas go back to what that rule gives them (they were set to review 0.74 earlier today):
--     768 -> matched 0.75; 1358, 1375, 1380 -> matched 1.0. Hedge fund evidence is confirmed on all four.
-- * Row 3061 merged into 3066 (same alert: "New Mexico considers axing absolute return allocation"),
--   the way earlier merges were done: the keeper carries the merged row in evidence.merged_rows,
--   3061 becomes validation_status 'merged' with merged_into = 3066, I-Connections rows pointing
--   at 3061 now point at 3066.
-- Backup: wi_mandates_backup_20261110_restore. Logged in wi_fill_log.

begin;

create table wi_mandates_backup_20261110_restore as
  select id, qualification, new_qualification, new_fit_score, validation_status, merged_into, evidence, intention_summary
    from wi_mandates where id in (768, 1358, 1375, 1380, 3061, 3066);

create temp table restore_1110 (id int primary key, q text, s numeric) on commit drop;
insert into restore_1110 values (768, 'matched', 0.75), (1358, 'matched', 1), (1375, 'matched', 1), (1380, 'matched', 1);

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id, source)
select m.id, m.investor_name, 'Verdict', concat_ws(' ', coalesce(m.new_qualification, m.qualification), coalesce(m.new_fit_score::text, '-')),
       concat_ws(' ', r.q, r.s::text), m.evidence ->> 'wi_investor_id',
       'Restore 10 Nov 2026 (decided by research@taranis.net): the verdict the current rule gives (long/short rule change not adopted)'
  from wi_mandates m join restore_1110 r on r.id = m.id
 where coalesce(m.new_qualification, m.qualification) = 'uncertain' and m.new_fit_score = 0.74 and coalesce(m.verdict_source, '') <> 'manual';
update wi_mandates m set qualification = r.q, new_qualification = r.q, new_fit_score = r.s
  from restore_1110 r
 where r.id = m.id and coalesce(m.new_qualification, m.qualification) = 'uncertain' and m.new_fit_score = 0.74
   and coalesce(m.verdict_source, '') <> 'manual';

-- 3061 into 3066
update wi_mandates k set
  evidence = (case when jsonb_typeof(k.evidence) = 'object' then k.evidence else '{}'::jsonb end)
             || jsonb_build_object('merged_rows', coalesce(k.evidence -> 'merged_rows', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                  'id', m.id, 'summary', m.intention_summary, 'tag', m.investor_tag, 'intention_url', m.view_intention_url,
                  'article_url', m.view_article_url, 'alert_date', m.alert_date, 'verdict', coalesce(m.new_qualification, m.qualification),
                  'score', m.new_fit_score, 'approved_at', m.approved_at, 'approved_by', m.approved_by,
                  'source_message_id', m.source_message_id))),
  intention_summary = case when btrim(coalesce(m.intention_summary, '')) <> '' and btrim(m.intention_summary) is distinct from btrim(coalesce(k.intention_summary, ''))
                           then concat_ws(' • ', k.intention_summary, m.intention_summary) else k.intention_summary end
  from wi_mandates m where k.id = 3066 and m.id = 3061;

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id, source)
select id, investor_name, 'Merged into row', coalesce(validation_status, ''), '3066', '2977',
       'Merge 10 Nov 2026 (decided by research@taranis.net): same alert (New Mexico considers axing absolute return allocation)'
  from wi_mandates where id = 3061;

update wi_mandates set validation_status = 'merged', merged_into = 3066 where id = 3061;
update iconnections_import_rows set matched_id = 3066 where matched_id = 3061;

commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--          new_fit_score = b.new_fit_score, validation_status = b.validation_status, merged_into = b.merged_into,
--          evidence = b.evidence, intention_summary = b.intention_summary
--     from wi_mandates_backup_20261110_restore b where b.id = m.id;
--   commit;
-- (I-Connections rows pointing at 3061 before the merge: none on 10 Nov 2026.)
