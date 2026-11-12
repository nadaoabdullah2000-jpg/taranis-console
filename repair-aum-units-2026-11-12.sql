-- 12 Nov 2026, APPLIED (approved by research@taranis.net): AUM written in millions by
-- "WI 01c — Investor Enrichment Backfill" (n8n OlWe4Wi6flt7bDtv, every 3 hours; paused 12 Nov).
-- WI 01c re-enriched every row with wi_enriched_at null, overwrote aum_usd with With Intelligence's
-- latest_aum.value_usd (millions of USD) and logged nothing.
--
-- Part A (applied): the 61 rows named in the reconciliation: the 60 discovery rows, restored from
-- yesterday's backup wi_mandates_backup_20261111_disc_fields, and Compound Planning (3012, no backup),
-- multiplied by 1,000,000. Dry run: every new value lies inside the row's own AUM band text.
-- ONE transaction. Backup: wi_mandates_backup_20261112_aum. Logged in wi_fill_log.
begin;
create temp table fix on commit drop as
select m.id, m.aum_usd old_aum,
       case when b.aum_usd >= 1e6 then b.aum_usd else round(m.aum_usd * 1e6) end new_aum,
       case when b.aum_usd >= 1e6 then 'restored from the 11 Nov backup' else 'millions x 1,000,000' end how
  from wi_mandates m left join wi_mandates_backup_20261111_disc_fields b on b.id = m.id
 where m.aum_usd > 0 and m.aum_usd < 1e6
   and (b.aum_usd >= 1e6 or m.id = 3012);
create table wi_mandates_backup_20261112_aum as
  select m.id, m.aum_usd from wi_mandates m join fix using (id);
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'aum_usd', f.old_aum::text, f.new_aum::text,
       'AUM unit repair (' || f.how || '), 12 Nov 2026 (approved by research@taranis.net)', m.evidence->>'wi_investor_id'
  from wi_mandates m join fix f using (id);
update wi_mandates m set aum_usd = f.new_aum from fix f where f.id = m.id;
commit;
-- UNDO: update wi_mandates m set aum_usd = b.aum_usd from wi_mandates_backup_20261112_aum b where b.id = m.id;
