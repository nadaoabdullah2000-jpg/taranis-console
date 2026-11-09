-- 9 Nov 2026: row 752 "Quilter" removed (decided by research@taranis.net). ONE transaction.
-- Soft removal, nothing deleted: rejected as a person's decision, excluded_at / excluded_reason
-- set, and its "unsure" entry in grok_checked marked reviewed so it leaves the review list.
-- The row came from Hedge Fund Alert 10 Jun 2026 p.2 ("Quilter provided a £100 million seed
-- investment for Logica Capital's European vehicle"); Grok could not tell which Quilter it is.
-- Backup: wi_mandates_backup_20261109_quilter. Logged in wi_fill_log.

begin;

create table wi_mandates_backup_20261109_quilter as
  select id, qualification, new_qualification, new_fit_score, fit_reason, verdict_source, verdict_set_by,
         verdict_set_at, approved_at, approved_by, excluded_at, excluded_reason
    from wi_mandates where id = 752;

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Verdict', coalesce(new_qualification, qualification), 'rejected',
       'Removed 9 Nov 2026: ambiguous Quilter entity, report prose only (decided by research@taranis.net)'
  from wi_mandates where id = 752;

update wi_mandates
   set qualification = 'rejected', new_qualification = 'rejected', new_fit_score = 0,
       fit_reason = 'Removed by a person: report prose only, and it is unclear which Quilter firm it is.',
       verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now(),
       approved_at = null, approved_by = null,
       excluded_at = now(), excluded_reason = 'Removed by research@taranis.net 9 Nov 2026'
 where id = 752;

update grok_checked set reviewed_at = now(), reviewed_by = 'research@taranis.net'
 where mandate_id = 752 and result = 'unsure' and reviewed_at is null;

commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--          new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, verdict_source = b.verdict_source,
--          verdict_set_by = b.verdict_set_by, verdict_set_at = now(), approved_at = b.approved_at,
--          approved_by = b.approved_by, excluded_at = b.excluded_at, excluded_reason = b.excluded_reason
--     from wi_mandates_backup_20261109_quilter b where b.id = m.id;
--   update grok_checked set reviewed_at = null, reviewed_by = null where mandate_id = 752 and result = 'unsure';
--   commit;
