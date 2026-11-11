-- 11 Nov 2026 (decided by research@taranis.net): Technology = Yes from the With Intelligence
-- "investment themes" line for LACERS (2056, 2105) and Oldendorff (2171). Their Tech = No came from the
-- earlier enrichment ("non-tech focus - private debt"), not from a person. Line: "Key investment themes
-- include security and defense and digital infrastructure". A person's own Tech = No (Philos, LSERS,
-- NC State, Bank of Singapore, Lehigh) stays. Verdicts are not changed.
-- ONE transaction. Nothing deleted. Backup: wi_mandates_backup_20261111_themes2. Logged in wi_fill_log.
begin;
create table wi_mandates_backup_20261111_themes2 as
  select id, is_tech_investor, tech_signal, focus_checks from wi_mandates where id in (2056, 2105, 2171);
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, investor_name, 'is_tech_investor', 'false (' || left(tech_signal, 150) || ')',
       'true (With Intelligence profile (theme line): "Key investment themes include security and defense and digital infrastructure")',
       'Theme line 11 Nov 2026 (decided by research@taranis.net)', evidence ->> 'wi_investor_id'
  from wi_mandates where id in (2056, 2105, 2171) and coalesce(tech_signal, '') not like 'Set by a person%';
update wi_mandates set is_tech_investor = true,
       tech_signal = 'With Intelligence profile (theme line): "Key investment themes include security and defense and digital infrastructure"',
       focus_checks = nullif(coalesce(focus_checks, '{}'::jsonb) - 'tech', '{}'::jsonb)
 where id in (2056, 2105, 2171) and coalesce(tech_signal, '') not like 'Set by a person%';
commit;
-- UNDO:
--   update wi_mandates m set is_tech_investor = b.is_tech_investor, tech_signal = b.tech_signal, focus_checks = b.focus_checks
--     from wi_mandates_backup_20261111_themes2 b where b.id = m.id;
