-- 12 Nov 2026, APPLIED (approved by research@taranis.net; 65 rows): Grok discovery staging,
-- regions filled from the country rather than the profile.
--
-- grok.wi_discovered holds 74 rows with a region; every one is simply the country's continent
-- (United States/Canada -> North America, European countries -> Europe, Singapore -> Asia).
-- 9 of them name that region in the profile's own text (intentions, summary, strategy focus,
-- approach) and are kept. The other 65 (24 of them among the first 30 discovered) are not
-- stated anywhere in the profile text: region is blanked and the old value kept in
-- raw_json.region_unverified, with a note.
--
-- Staging only: region was never copied into wi_mandates (no live row, evidence key or
-- wi_fill_log entry carries it), so nothing in the tool changes.
-- ONE transaction. Backup: grok_wi_discovered_backup_20261112_region.
begin;
create temp table reg on commit drop as
select wi_id, region from grok.wi_discovered
 where coalesce(region, '') <> ''
   and not ((coalesce(intentions::text, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(strategy_focus::text, '') || ' '
             || coalesce(approach::text, '')) ~* replace(region, ' ', '[ -]'));
create table public.grok_wi_discovered_backup_20261112_region as
  select d.wi_id, d.region, d.raw_json from grok.wi_discovered d join reg using (wi_id);
update grok.wi_discovered d
   set raw_json = (case when jsonb_typeof(d.raw_json) = 'object' then d.raw_json else '{}'::jsonb end)
                  || jsonb_build_object('region_unverified', reg.region,
                       'region_note', 'Blanked 12 Nov 2026: the country''s continent, not stated in the profile (approved by research@taranis.net)'),
       region = null
  from reg where reg.wi_id = d.wi_id;
commit;
-- UNDO: update grok.wi_discovered d set region = b.region, raw_json = b.raw_json
--   from public.grok_wi_discovered_backup_20261112_region b where b.wi_id = d.wi_id;
