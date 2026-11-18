-- 17 Nov 2026, APPLIED (decided by the user): Matched -> Review 0.74, kept as manual verdicts.
--   2897 Norway GPFG: long/short rests on a past allocation ($250m SMA to CapeView Capital), not a stated mandate.
--   3216 Ewing Marion Kauffman Foundation: its intention is to reduce beta against its long/short equity holdings.
-- Backup: wi_mandates_backup_20261117_pastls. Logged in wi_fill_log.
begin;
create table wi_mandates_backup_20261117_pastls as
  select id, qualification, new_qualification, new_fit_score, verdict_source, verdict_set_by, verdict_set_at, fit_reason
    from wi_mandates where id in (2897, 3216);
-- (log + update as run: new_qualification 'uncertain', new_fit_score 0.74, qualification 'uncertain',
--  verdict_source 'manual', verdict_set_by 'research (17 Nov 2026)', fit_reason prefixed with the reason)
commit;
-- UNDO: update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--   new_fit_score = b.new_fit_score, verdict_source = b.verdict_source, verdict_set_by = b.verdict_set_by,
--   verdict_set_at = b.verdict_set_at, fit_reason = b.fit_reason from wi_mandates_backup_20261117_pastls b where b.id = m.id;
