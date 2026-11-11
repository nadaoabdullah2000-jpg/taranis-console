-- 11 Nov 2026 (DRAFT until research@taranis.net approves): rescore of the 76 discovery inserts now that the
-- field check filled their data. Values from the console's own rescore (with the profile-read evidence shown,
-- not scored: PR #22). Dry run: 1 Matched (Ewing Marion Kauffman Foundation, 90%, long/short + quoted
-- Tech from its themes line), 0 low matches, 65 Review, 8 stay Needs data, 2 Rejected (asset classes stated
-- without hedge funds: Kenneth Rainin Foundation, University of California Retirement Plan).
-- A person's verdict is never changed. ONE transaction. Backup: wi_mandates_backup_20261111_disc_rescore.
begin;
create table wi_mandates_backup_20261111_disc_rescore as
  select id, qualification, new_qualification, new_fit_score, fit_reason from wi_mandates where alert_type = 'Discovery find';
create temp table rs(id bigint, q text, s numeric) on commit drop;
insert into rs values
  (3176, 'uncertain', 0.74),
  (3177, 'uncertain', 0.74),
  (3178, 'uncertain', 0.74),
  (3179, 'uncertain', 0.74),
  (3180, 'uncertain', 0.74),
  (3181, 'uncertain', 0.74),
  (3182, 'uncertain', 0.74),
  (3183, 'uncertain', 0.74),
  (3184, 'uncertain', 0.74),
  (3187, 'uncertain', 0.65),
  (3188, 'uncertain', 0.74),
  (3189, 'uncertain', 0.74),
  (3190, 'uncertain', 0.74),
  (3191, 'uncertain', 0.74),
  (3192, 'uncertain', 0.74),
  (3193, 'uncertain', 0.74),
  (3194, 'uncertain', 0.74),
  (3196, 'rejected', 0),
  (3199, 'uncertain', 0.74),
  (3200, 'uncertain', 0.74),
  (3202, 'uncertain', 0.74),
  (3203, 'uncertain', 0.74),
  (3204, 'uncertain', 0.74),
  (3205, 'uncertain', 0.74),
  (3206, 'uncertain', 0.74),
  (3210, 'uncertain', 0.74),
  (3209, 'uncertain', 0.74),
  (3213, 'uncertain', 0.74),
  (3216, 'matched', 0.9),
  (3219, 'uncertain', 0.74),
  (3230, 'uncertain', 0.74),
  (3233, 'uncertain', 0.74),
  (3235, 'uncertain', 0.74),
  (3239, 'uncertain', 0.74),
  (3244, 'uncertain', 0.74),
  (3247, 'uncertain', 0.74),
  (3251, 'uncertain', 0.74),
  (3249, 'uncertain', 0.74),
  (3248, 'uncertain', 0.74),
  (3245, 'uncertain', 0.74),
  (3242, 'uncertain', 0.74),
  (3237, 'uncertain', 0.74),
  (3231, 'uncertain', 0.74),
  (3229, 'uncertain', 0.74),
  (3227, 'uncertain', 0.74),
  (3225, 'uncertain', 0.74),
  (3224, 'uncertain', 0.74),
  (3223, 'uncertain', 0.74),
  (3222, 'uncertain', 0.74),
  (3221, 'uncertain', 0.74),
  (3220, 'uncertain', 0.74),
  (3218, 'uncertain', 0.74),
  (3217, 'uncertain', 0.74),
  (3215, 'uncertain', 0.74),
  (3214, 'uncertain', 0.74),
  (3211, 'uncertain', 0.74),
  (3207, 'uncertain', 0.74),
  (3185, 'uncertain', 0.74),
  (3198, 'uncertain', 0.74),
  (3208, 'uncertain', 0.74),
  (3226, 'uncertain', 0.74),
  (3232, 'uncertain', 0.74),
  (3234, 'uncertain', 0.74),
  (3238, 'uncertain', 0.74),
  (3241, 'uncertain', 0.74),
  (3240, 'uncertain', 0.74),
  (3246, 'rejected', 0),
  (3250, 'uncertain', 0.74);
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'Verdict', concat_ws(' ', m.new_qualification, coalesce(m.new_fit_score::text, '-')), rs.q || ' ' || coalesce(rs.s::text, '-'),
       'Discovery rescore 11 Nov 2026 (approved by research@taranis.net)', m.evidence ->> 'wi_investor_id'
  from wi_mandates m join rs on rs.id = m.id where m.alert_type = 'Discovery find' and coalesce(m.verdict_source, '') <> 'manual';
update wi_mandates m set new_qualification = rs.q, qualification = case when rs.q in ('matched','rejected') then rs.q else 'uncertain' end,
       new_fit_score = rs.s,
       fit_reason = 'Rescored 11 Nov 2026 from the With Intelligence profile read (' || coalesce(m.new_qualification, '-') || ' -> ' || rs.q || '). ' || coalesce(m.fit_reason, '')
  from rs where rs.id = m.id and m.alert_type = 'Discovery find' and coalesce(m.verdict_source, '') <> 'manual';
commit;
-- UNDO: update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--   new_fit_score = b.new_fit_score, fit_reason = b.fit_reason from wi_mandates_backup_20261111_disc_rescore b where b.id = m.id;
