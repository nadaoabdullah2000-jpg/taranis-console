-- 11 Nov 2026, APPROVED by research@taranis.net: field check of the 76 discovery inserts.
-- Source: the live With Intelligence read (wi_full_reads: profile + intentions) and Grok's capture
-- (grok.wi_discovered), turned into a row plan by scripts/discovery-field-fill.mjs (wi_disc_fill_plan).
-- Only blanks are filled. A field the profile and intentions genuinely do not state gets
-- focus_checks.<field> = {result: not_stated, note, at, by: 'live read'} ("not stated (checked)");
-- private_markets_only where it is stated only for private equity / venture; stated_other_currency
-- for a ticket in another currency. Verdicts are not changed (they stay Needs data).
-- Also: the 4 first-run discovery records whose industries field held a themes list get With
-- Intelligence's own industries (the old list kept in raw_json.industries_replaced).
-- ONE transaction. Nothing deleted. Backups: wi_mandates_backup_20261111_disc_fields,
-- grok_wi_discovered_backup_20261111_industries. Logged in wi_fill_log.

begin;
create table wi_mandates_backup_20261111_disc_fields as
  select id, investor_type, investor_country, investor_city, aum_usd, aum_band, ticket_min_usd, ticket_max_usd, strategies, asset_classes,
         open_to_emerging_markets, open_to_emerging_managers, is_tech_investor, tech_signal, is_space, space_signal, intention_summary,
         evidence, focus_checks
    from wi_mandates where alert_type = 'Discovery find';

create temp table dp on commit drop as
select p.*, r.notes, r.profile,
       (select jsonb_agg(jsonb_build_object('date', left(n->>'date', 10), 'type', n->>'type', 'status', n->>'status', 'note', left(n->>'note', 600)) order by i)
          from jsonb_array_elements(coalesce(r.notes, '[]'::jsonb)) with ordinality x(n, i) where i <= 10) ints_json,
       (select jsonb_agg(distinct nm) from (
          select btrim(y->>'name') nm from jsonb_array_elements(coalesce(r.profile->'investment_industries', '[]'::jsonb)) x,
                 lateral jsonb_array_elements(jsonb_build_array(x->'primary_industry') || coalesce(x->'secondary_industries', '[]'::jsonb)) y
           where y->>'name' is not null and y->>'name' !~* '^(other|unknown|unspecified|n/a|none|all sectors)$') z) inds
  from wi_disc_fill_plan p
  join lateral (select * from wi_full_reads r where r.wi_id = p.wi_id and r.status in ('ok','partial') order by r.read_at desc limit 1) r on true;

-- log: every filled field, then every check
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select d.id, m.investor_name, e.key, null, coalesce(d.log ->> e.key, 'live read profile: ' || left(e.value::text, 250)),
       'Discovery field check 11 Nov 2026 (approved by research@taranis.net)', d.wi_id
  from dp d join wi_mandates m on m.id = d.id, lateral jsonb_each(d.set_) e
 where e.key <> '__intention_idx';
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select d.id, m.investor_name, 'intention_summary', null, coalesce(d.log ->> 'intention_summary', 'intention'),
       'Discovery field check 11 Nov 2026 (approved by research@taranis.net)', d.wi_id
  from dp d join wi_mandates m on m.id = d.id where d.set_ ? '__intention_idx';
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select d.id, m.investor_name, 'check.' || e.key, null, (e.value ->> 'result') || coalesce(': ' || (e.value ->> 'note'), ''),
       'Discovery field check 11 Nov 2026 (approved by research@taranis.net)', d.wi_id
  from dp d join wi_mandates m on m.id = d.id, lateral jsonb_each(d.checks) e;

update wi_mandates m set
  investor_type     = coalesce(m.investor_type, d.set_ ->> 'investor_type'),
  investor_country  = coalesce(m.investor_country, d.set_ ->> 'investor_country'),
  investor_city     = coalesce(m.investor_city, d.set_ ->> 'investor_city'),
  aum_usd           = coalesce(m.aum_usd, (d.set_ ->> 'aum_usd')::numeric),
  aum_band          = coalesce(m.aum_band, d.set_ ->> 'aum_band'),
  ticket_min_usd    = coalesce(m.ticket_min_usd, (d.set_ ->> 'ticket_min_usd')::numeric),
  ticket_max_usd    = coalesce(m.ticket_max_usd, (d.set_ ->> 'ticket_max_usd')::numeric),
  strategies        = case when jsonb_array_length(coalesce(m.strategies, '[]'::jsonb)) = 0 and d.set_ ? 'strategies' then d.set_ -> 'strategies' else m.strategies end,
  asset_classes     = case when jsonb_array_length(coalesce(m.asset_classes, '[]'::jsonb)) = 0 and d.set_ ? 'asset_classes' then d.set_ -> 'asset_classes' else m.asset_classes end,
  open_to_emerging_managers = coalesce(m.open_to_emerging_managers, (d.set_ ->> 'open_to_emerging_managers')::boolean),
  is_tech_investor  = case when m.is_tech_investor is null and d.set_ ? 'is_tech_investor' then true else m.is_tech_investor end,
  tech_signal       = case when m.is_tech_investor is null and d.set_ ? 'is_tech_investor' then d.set_ ->> 'tech_signal' else m.tech_signal end,
  is_space          = case when m.is_space is not true and d.set_ ? 'is_space' then true else m.is_space end,
  space_signal      = case when m.is_space is not true and d.set_ ? 'is_space' then d.set_ ->> 'space_signal' else m.space_signal end,
  intention_summary = case when nullif(btrim(coalesce(m.intention_summary, '')), '') is null and d.set_ ? '__intention_idx'
                           then left(d.notes -> ((d.set_ ->> '__intention_idx')::int) ->> 'note', 2000) else m.intention_summary end,
  evidence          = (case when jsonb_typeof(m.evidence) = 'object' then m.evidence else '{}'::jsonb end) || d.ev
                      || case when d.ints_json is not null then jsonb_build_object('wi_intentions', d.ints_json) else '{}'::jsonb end
                      || case when d.inds is not null then jsonb_build_object('wi_industries', d.inds) else '{}'::jsonb end,
  focus_checks      = coalesce(m.focus_checks, '{}'::jsonb)
                      || coalesce((select jsonb_object_agg(e.key, e.value || jsonb_build_object('note', coalesce(e.value ->> 'note',
                                     'Checked: With Intelligence profile and intentions (live read 11 Nov 2026)'), 'at', '2026-11-11', 'by', 'live read'))
                                   from jsonb_each(d.checks) e), '{}'::jsonb)
  from dp d
 where m.id = d.id and m.alert_type = 'Discovery find' and coalesce(m.verdict_source, '') <> 'manual';

-- industries fix (the 4 first-run records)
create table grok_wi_discovered_backup_20261111_industries as
  select wi_id, industries, investment_themes, raw_json from grok.wi_discovered where wi_id in ('2147327237', '2147346086', '3979', '2560');
update grok.wi_discovered g set
  raw_json = coalesce(g.raw_json, '{}'::jsonb) || jsonb_build_object('industries_replaced', g.industries,
             'industries_fix', 'Was a themes list, not With Intelligence industries; replaced 11 Nov 2026 from the live profile'),
  industries = coalesce((select jsonb_agg(distinct btrim(y->>'name'))
                 from wi_full_reads r, jsonb_array_elements(coalesce(r.profile->'investment_industries', '[]'::jsonb)) x,
                      lateral jsonb_array_elements(jsonb_build_array(x->'primary_industry') || coalesce(x->'secondary_industries', '[]'::jsonb)) y
                where r.wi_id = g.wi_id and r.status = 'ok' and y->>'name' is not null
                  and y->>'name' !~* '^(other|unknown|unspecified|n/a|none|all sectors)$'), '[]'::jsonb)
 where g.wi_id in ('2147327237', '2147346086', '3979', '2560');
commit;

-- UNDO:
--   update wi_mandates m set investor_type = b.investor_type, investor_country = b.investor_country, investor_city = b.investor_city,
--     aum_usd = b.aum_usd, aum_band = b.aum_band, ticket_min_usd = b.ticket_min_usd, ticket_max_usd = b.ticket_max_usd,
--     strategies = b.strategies, asset_classes = b.asset_classes, open_to_emerging_managers = b.open_to_emerging_managers,
--     is_tech_investor = b.is_tech_investor, tech_signal = b.tech_signal, is_space = b.is_space, space_signal = b.space_signal,
--     intention_summary = b.intention_summary, evidence = b.evidence, focus_checks = b.focus_checks
--     from wi_mandates_backup_20261111_disc_fields b where b.id = m.id;
--   update grok.wi_discovered g set industries = b.industries, raw_json = b.raw_json
--     from grok_wi_discovered_backup_20261111_industries b where b.wi_id = g.wi_id;
