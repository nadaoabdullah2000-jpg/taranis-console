-- 12 Nov 2026, APPLIED (approved by research@taranis.net): country codes mangled by the
-- WI 01b / WI 01c fallback (first two letters of a country name missing from their short list).
-- Scan: every row whose code is one the fallback can produce, checked against its city and against
-- With Intelligence's own country (stored profile reads). Seven rows are wrong:
--   3179 Mahi546, 3189 Mahi Alpha Select (Vienna)       AU -> AT  (Austria, not Australia)
--   2325, 2329 Albacore doo (Ljubljana)                  SL -> SI  (Slovenia, not Sierra Leone)
--   2971, 2993 Banque Richelieu Monaco (Monaco)          MO -> MC  (Monaco, not Macao)
--   720 Inversiones Nogaleda SA (Santiago; pending)      CH -> CL  (Chile, not Switzerland)
-- ONE transaction. Backup: wi_mandates_backup_20261112_country. Logged in wi_fill_log.
begin;
create temp table fix(id bigint, old_c text, new_c text) on commit drop;
insert into fix values (3179,'AU','AT'), (3189,'AU','AT'), (2325,'SL','SI'), (2329,'SL','SI'),
                       (2971,'MO','MC'), (2993,'MO','MC'), (720,'CH','CL');
create table wi_mandates_backup_20261112_country as
  select m.id, m.investor_country from wi_mandates m join fix f on f.id = m.id and m.investor_country = f.old_c;
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'investor_country', f.old_c, f.new_c,
       'Country code repair (two-letter fallback), 12 Nov 2026 (approved by research@taranis.net)', m.evidence->>'wi_investor_id'
  from wi_mandates m join fix f on f.id = m.id and m.investor_country = f.old_c;
update wi_mandates m set investor_country = f.new_c from fix f where f.id = m.id and m.investor_country = f.old_c;
commit;
-- UNDO: update wi_mandates m set investor_country = b.investor_country
--   from wi_mandates_backup_20261112_country b where b.id = m.id;
