-- 11 Nov 2026: CAIS rejected as a person's decision (research@taranis.net):
-- "Not an allocator; platform, and its intentions are news or market-neutral".
-- All 10 CAIS rows that are not merged are set to rejected (manual), including the 4 the rule
-- had already rejected, so no rescore can reopen them. The 2 rows merged into 2965 are left as
-- they are. ONE transaction. Nothing deleted.
-- Backup: wi_mandates_backup_20261111_cais. Logged in wi_fill_log.

begin;
create table wi_mandates_backup_20261111_cais as
  select id, qualification, new_qualification, new_fit_score, fit_reason, hard_fail_reasons, verdict_source, verdict_set_by,
         verdict_set_at, approved_at, approved_by
    from wi_mandates where id in (2965, 2966, 2969, 2970, 2972, 2992, 3000, 3001, 3002, 3004);

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Verdict', concat_ws(' ', coalesce(new_qualification, qualification), coalesce(new_fit_score::text, '-')), 'rejected 0',
       'Rejected 11 Nov 2026 (decided by research@taranis.net): Not an allocator; platform, and its intentions are news or market-neutral'
  from wi_mandates where id in (2965, 2966, 2969, 2970, 2972, 2992, 3000, 3001, 3002, 3004);

update wi_mandates
   set qualification = 'rejected', new_qualification = 'rejected', new_fit_score = 0,
       fit_reason = 'Not an allocator: platform, and its intentions are news or market-neutral.',
       hard_fail_reasons = '["Not an allocator: platform, and its intentions are news or market-neutral"]'::jsonb,
       verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now(),
       approved_at = null, approved_by = null
 where id in (2965, 2966, 2969, 2970, 2972, 2992, 3000, 3001, 3002, 3004);
commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--          new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, hard_fail_reasons = b.hard_fail_reasons,
--          verdict_source = b.verdict_source, verdict_set_by = b.verdict_set_by, verdict_set_at = now(),
--          approved_at = b.approved_at, approved_by = b.approved_by
--     from wi_mandates_backup_20261111_cais b where b.id = m.id;
--   commit;
-- (verdict_set_at must change for the manual-verdict guard to accept the restore.)
