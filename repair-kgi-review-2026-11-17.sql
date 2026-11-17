-- 17 Nov 2026, APPLIED (decided by the user): KGI Life Insurance (row 32) demoted from Matched 1.00 to Review 0.74,
-- kept as a manual verdict. Its long/short evidence is past commitments to long/short funds (M37 Offshore Fund,
-- Tensor Edge Capital), not a stated mandate, so it is not a match. Tech (set by a person) is unchanged.
-- Backup: wi_mandates_backup_20261117_kgi. Logged in wi_fill_log.
begin;
create table wi_mandates_backup_20261117_kgi as
  select id, qualification, new_qualification, new_fit_score, verdict_source, verdict_set_by, verdict_set_at, fit_reason from wi_mandates where id = 32;
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, investor_name, 'verdict', new_qualification || ' ' || new_fit_score, 'uncertain 0.74',
       'Demoted 17 Nov 2026 (decided by the user): long/short rests on past fund commitments, not a stated mandate, so not a match', evidence->>'wi_investor_id'
  from wi_mandates where id = 32;
update wi_mandates set new_qualification = 'uncertain', new_fit_score = 0.74, qualification = 'uncertain',
       verdict_source = 'manual', verdict_set_by = 'research (17 Nov 2026)', verdict_set_at = now(),
       fit_reason = 'Review (decided 17 Nov 2026): its long/short evidence is past commitments to long/short funds (M37, Tensor Edge), not a stated mandate. ' || coalesce(fit_reason, '')
 where id = 32;
commit;
-- UNDO: update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--   new_fit_score = b.new_fit_score, verdict_source = b.verdict_source, verdict_set_by = b.verdict_set_by,
--   verdict_set_at = b.verdict_set_at, fit_reason = b.fit_reason from wi_mandates_backup_20261117_kgi b where b.id = m.id;
