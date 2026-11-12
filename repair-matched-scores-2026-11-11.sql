-- 11 Nov 2026, APPROVED by research@taranis.net: Matched rows carrying scores from before today's rules,
-- set to the console's rescore so the Matched order is consistent (quoted full matches 90%+, low matches 89%).
-- Checked: all 36 Matched rows; your own verdicts (Crewcial, Seidor, Bank of Singapore 127) left out.
--   2885 Princeton University        0.80 -> 1.00
--   2891 NewAlpha Asset Management   0.75 -> 1.00
--   2890 Brandeis University         0.95 -> 0.90
-- Verdicts stay Matched. ONE transaction. Backup: wi_mandates_backup_20261111_matched_scores. Logged in wi_fill_log.
begin;
create table wi_mandates_backup_20261111_matched_scores as
  select id, new_fit_score, fit_score, fit_reason from wi_mandates where id in (2885, 2891, 2890);
create temp table ms(id bigint, s numeric) on commit drop;
insert into ms values (2885, 1.0), (2891, 1.0), (2890, 0.9);
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'Score', m.new_fit_score::text, ms.s::text,
       'Matched order: rescore of a pre-today score, 11 Nov 2026 (approved by research@taranis.net)', m.evidence ->> 'wi_investor_id'
  from wi_mandates m join ms on ms.id = m.id
 where m.new_qualification = 'matched' and coalesce(m.verdict_source, '') <> 'manual';
update wi_mandates m set new_fit_score = ms.s
  from ms where ms.id = m.id and m.new_qualification = 'matched' and coalesce(m.verdict_source, '') <> 'manual';
commit;
-- UNDO: update wi_mandates m set new_fit_score = b.new_fit_score
--   from wi_mandates_backup_20261111_matched_scores b where b.id = m.id;
