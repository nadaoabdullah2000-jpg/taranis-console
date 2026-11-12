-- 12 Nov 2026, DRAFT (run after research@taranis.net approves the dry-run list): the other 43 rows
-- with AUM in millions (same WI 01c bug, enriched 5-11 Nov; 29 live, 11 merged, 3 pending).
-- Each value x 1,000,000; dry run: every new value lies inside the row's own AUM band text.
-- Part A (the 61 rows) is repair-aum-units-2026-11-12.sql.
-- ONE transaction. Backup: wi_mandates_backup_20261112_aum_b. Logged in wi_fill_log.
begin;
create temp table fix on commit drop as
select id, aum_usd old_aum, round(aum_usd * 1e6) new_aum from wi_mandates where aum_usd > 0 and aum_usd < 1e6;
create table wi_mandates_backup_20261112_aum_b as select m.id, m.aum_usd from wi_mandates m join fix using (id);
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'aum_usd', f.old_aum::text, f.new_aum::text,
       'AUM unit repair (millions x 1,000,000), 12 Nov 2026 (approved by research@taranis.net)', m.evidence->>'wi_investor_id'
  from wi_mandates m join fix f using (id);
update wi_mandates m set aum_usd = f.new_aum from fix f where f.id = m.id;
commit;
-- UNDO: update wi_mandates m set aum_usd = b.aum_usd from wi_mandates_backup_20261112_aum_b b where b.id = m.id;
