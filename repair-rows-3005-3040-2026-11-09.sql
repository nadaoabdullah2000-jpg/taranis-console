-- 9 Nov 2026. ONE transaction. Nothing deleted.
--  * Row 3005 "Startup HF Convexa" ("taps QVR founder as CIO"): a hedge fund hiring a CIO,
--    not an allocator. Rejected as a person's decision (research@taranis.net).
--  * Rows 3029 and 3040 "Direct lending on horizon for Cornerstone": the same alert (7 and
--    9 Nov). 3040 merged into 3029 the way the 5 Nov change merged duplicates: the keeper
--    carries the merged row in evidence.merged_rows, 3040 becomes validation_status 'merged'
--    with merged_into = 3029, I-Connections rows pointing at 3040 now point at 3029.
-- Backup: wi_mandates_backup_20261109_rows. Logged in wi_fill_log.

begin;

create table wi_mandates_backup_20261109_rows as
  select id, qualification, new_qualification, new_fit_score, fit_reason, verdict_source, verdict_set_by,
         verdict_set_at, approved_at, approved_by, validation_status, merged_into, evidence, intention_summary
    from wi_mandates where id in (3005, 3029, 3040);

-- 3005: rejected
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Verdict', coalesce(new_qualification, qualification), 'rejected',
       'Not an allocator 9 Nov 2026: a hedge fund hiring a CIO (decided by research@taranis.net)'
  from wi_mandates where id = 3005;
update wi_mandates
   set qualification = 'rejected', new_qualification = 'rejected', new_fit_score = 0,
       fit_reason = 'Not an investor mandate: a hedge fund hiring a CIO (manager news), not an allocator.',
       verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now(),
       approved_at = null, approved_by = null
 where id = 3005;

-- 3040 into 3029
update wi_mandates k set
  evidence = (case when jsonb_typeof(k.evidence) = 'object' then k.evidence else '{}'::jsonb end)
             || jsonb_build_object('merged_rows', coalesce(k.evidence -> 'merged_rows', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                  'id', m.id, 'summary', m.intention_summary, 'tag', m.investor_tag, 'intention_url', m.view_intention_url,
                  'article_url', m.view_article_url, 'alert_date', m.alert_date, 'verdict', coalesce(m.new_qualification, m.qualification),
                  'score', m.new_fit_score, 'approved_at', m.approved_at, 'approved_by', m.approved_by))),
  intention_summary = case when btrim(coalesce(m.intention_summary, '')) <> '' and btrim(m.intention_summary) is distinct from btrim(coalesce(k.intention_summary, ''))
                           then concat_ws(' • ', k.intention_summary, m.intention_summary) else k.intention_summary end
  from wi_mandates m where k.id = 3029 and m.id = 3040;

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Merged into row', coalesce(validation_status, ''), '3029', 'Merge 9 Nov 2026: same alert (Cornerstone direct lending, 7 and 9 Nov)'
  from wi_mandates where id = 3040;

update wi_mandates m set validation_status = 'merged', merged_into = 3029,
       hf_evidence = coalesce(k.hf_evidence, m.hf_evidence), hf_evidence_note = coalesce(k.hf_evidence_note, m.hf_evidence_note)
  from wi_mandates k where k.id = 3029 and m.id = 3040;

update iconnections_import_rows set matched_id = 3029 where matched_id = 3040;

commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--          new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, verdict_source = b.verdict_source,
--          verdict_set_by = b.verdict_set_by, verdict_set_at = now(), approved_at = b.approved_at, approved_by = b.approved_by,
--          validation_status = b.validation_status, merged_into = b.merged_into, evidence = b.evidence,
--          intention_summary = b.intention_summary
--     from wi_mandates_backup_20261109_rows b where b.id = m.id;
--   commit;
