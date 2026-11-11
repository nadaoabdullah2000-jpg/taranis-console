-- 11 Nov 2026 (decided by research@taranis.net): six more Technology = Yes saves reset to blank so Grok
-- re-checks them under the tightened rule (Technology only for hedge funds or public markets; theme lists
-- and market views do not count): NMPERA, OCERS, Albacore, Mass General Brigham, DUMAC, ADIC.
-- NewAlpha, Citi and NCRS are kept. Only values Grok set (tech_signal 'With Intelligence profile (Grok): ...').
-- Verdicts are not changed. ONE transaction. Nothing deleted. Backup: wi_mandates_backup_20261111_techreset2.

begin;
create table wi_mandates_backup_20261111_techreset2 as
  select id, is_tech_investor, tech_signal, focus_checks from wi_mandates
   where id in (876, 889, 903, 910, 2325, 2329, 2364, 2896, 311, 2739, 765);
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'is_tech_investor', is_tech_investor::text || ' (' || left(tech_signal, 200) || ')', null,
       'Reset 11 Nov 2026 (decided by research@taranis.net): Grok to re-check Technology under the tightened rule'
  from wi_mandates where id in (876, 889, 903, 910, 2325, 2329, 2364, 2896, 311, 2739, 765)
   and tech_signal like 'With Intelligence profile (Grok):%';
update wi_mandates set is_tech_investor = null, tech_signal = null
 where id in (876, 889, 903, 910, 2325, 2329, 2364, 2896, 311, 2739, 765)
   and tech_signal like 'With Intelligence profile (Grok):%';
commit;

-- UNDO:
--   update wi_mandates m set is_tech_investor = b.is_tech_investor, tech_signal = b.tech_signal, focus_checks = b.focus_checks
--     from wi_mandates_backup_20261111_techreset2 b where b.id = m.id;
