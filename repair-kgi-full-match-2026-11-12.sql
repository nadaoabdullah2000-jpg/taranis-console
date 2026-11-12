-- 12 Nov 2026, DRAFT (run only after research@taranis.net approves): KGI Life Insurance (row 32)
-- out of low match into a full match.
--
-- Why: its Technology came from the alert text only (low match, capped at 89%). Its With
-- Intelligence intentions, stored 11 Nov, show hedge fund commitments to AI and semiconductor
-- long/short funds: $20m to the M37 Offshore Fund (long/short equity, AI ecosystem, Jun 2026)
-- and $17m + $20m to the Tensor Edge Capital Offshore Fund (fundamental long/short,
-- semiconductor and software, May-Jun 2026). The user decided this counts as Tech.
--
-- Change (dry run with the console's own rescore): Tech set by a person (is_tech_investor true,
-- tech_signal 'Set by a person: ...'), which the match rule and the database guard zz_match_rule
-- accept as quoted Tech. Verdict stays Matched; score 0.89 -> 1.00; the low-match note goes;
-- verdict_source set to manual (the user's decision), so no rule or re-score changes it later.
-- ONE transaction. Backup: wi_mandates_backup_20261112_kgi. Logged in wi_fill_log.
begin;
create table wi_mandates_backup_20261112_kgi as
  select id, qualification, new_qualification, new_fit_score, fit_reason, verdict_source, verdict_set_by, verdict_set_at, is_tech_investor, tech_signal
    from wi_mandates where id = 32;
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, investor_name, 'Verdict', concat_ws(' ', new_qualification, new_fit_score::text, '(low match)'), 'matched 1.00 (full match: Tech from hedge fund intentions)',
       'KGI out of low match, 12 Nov 2026 (approved by research@taranis.net)', evidence->>'wi_investor_id'
  from wi_mandates where id = 32 and new_qualification = 'matched';
update wi_mandates
   set is_tech_investor = true,
       tech_signal = 'Set by a person: research@taranis.net, 2026-11-12 (With Intelligence hedge fund commitments: $20m to M37 Offshore Fund, AI long/short; $37m to Tensor Edge Capital, semiconductor and software long/short, May-Jun 2026)',
       new_fit_score = 1.00,
       fit_reason = 'Long/short and Technology from its hedge fund intentions (AI and semiconductor long/short funds), set by a person 12 Nov 2026.',
       verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now()
 where id = 32 and new_qualification = 'matched';
commit;
-- UNDO: update wi_mandates m set new_qualification = b.new_qualification, qualification = b.qualification,
--   new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, verdict_source = b.verdict_source,
--   verdict_set_by = b.verdict_set_by, verdict_set_at = b.verdict_set_at,
--   is_tech_investor = b.is_tech_investor, tech_signal = b.tech_signal
--   from wi_mandates_backup_20261112_kgi b where b.id = m.id;
