-- 11 Nov 2026: HF Ranch rejected as a person's decision (research@taranis.net):
-- "Not an allocator; hedge fund manager launching a fund". The With Intelligence article (5 Nov 2026,
-- "Ex-Citadel analyst's startup HF Ranch unveils firm leadership") is about Ranch Investment
-- Management's new long/short equity fund and links only to a manager profile.
-- Rows: 3011 (review 0.74), 2983 and 2304 (Ranch Investment Management, same launch; already
-- rejected by the rule), all set to rejected (manual) so no rescore can reopen them.
-- ONE transaction. Nothing deleted. Backup: wi_mandates_backup_20261111_hfranch. Logged in wi_fill_log.

begin;
create table wi_mandates_backup_20261111_hfranch as
  select id, qualification, new_qualification, new_fit_score, fit_reason, hard_fail_reasons, verdict_source, verdict_set_by,
         verdict_set_at, approved_at, approved_by
    from wi_mandates where id in (2304, 2983, 3011);

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Verdict', concat_ws(' ', coalesce(new_qualification, qualification), coalesce(new_fit_score::text, '-')), 'rejected 0',
       'Rejected 11 Nov 2026 (decided by research@taranis.net): Not an allocator; hedge fund manager launching a fund'
  from wi_mandates where id in (2304, 2983, 3011);

update wi_mandates
   set qualification = 'rejected', new_qualification = 'rejected', new_fit_score = 0,
       fit_reason = 'Not an allocator: hedge fund manager launching a fund.',
       hard_fail_reasons = '["Not an allocator: hedge fund manager launching a fund"]'::jsonb,
       verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now(),
       approved_at = null, approved_by = null
 where id in (2304, 2983, 3011);
commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--          new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, hard_fail_reasons = b.hard_fail_reasons,
--          verdict_source = b.verdict_source, verdict_set_by = b.verdict_set_by, verdict_set_at = now(),
--          approved_at = b.approved_at, approved_by = b.approved_by
--     from wi_mandates_backup_20261111_hfranch b where b.id = m.id;
--   commit;
-- (verdict_set_at must change for the manual-verdict guard to accept the restore.)
