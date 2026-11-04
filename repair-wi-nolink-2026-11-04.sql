-- Repair 4 Nov 2026 (night): allocators that had NO With Intelligence link.
--
-- With Intelligence's own name search (main and family-office databases) was
-- run for each of the 328 distinct names among the 693 rows without a link
-- (wi_nolink_groups -> wi_link_fix). 271 names returned nothing. Of the 57
-- that returned profiles, 23 names have one clear profile for the same
-- organisation (an exact name, or the name plus "LLC" / "Ltd" / the firm
-- behind it); those 46 rows are linked here (wi_link_decision status
-- 'Linked'). Names that are headline words or fit several profiles
-- (Millennium, Julius Baer, Goldman Sachs, Kern County, Oregon, ...) are
-- left without a link. Same refresh rules as repair-wi-links-2026-11-04.sql;
-- every change logged in wi_fill_log (source 'Name search 4 Nov 2026').

drop table if exists fx;
create temp table fx as
select d.mandate_id, d.new_wi_id, d.note, p.payload -> 'norm' as n,
       case p.payload -> 'norm' ->> 'country' when 'UK' then 'GB' when 'FX' then 'FR' else p.payload -> 'norm' ->> 'country' end as ctry,
       btrim(regexp_replace(regexp_replace(coalesce(p.payload -> 'raw' ->> 'summary', ''), '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')) as summary
  from wi_link_decision d join iconn_wi_profiles p on p.wi_id = d.new_wi_id and p.status = 'ok'
 where d.status = 'Linked';

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, f.n ->> 'name', v.field, v.o, v.nv, 'Name search 4 Nov 2026', f.new_wi_id
  from fx f join wi_mandates m on m.id = f.mandate_id,
  lateral (values
    ('Link added: Investor page', m.view_investor_url, f.n ->> 'link'),
    ('Corrected: Name', m.investor_name, f.n ->> 'name'),
    ('Corrected: Investor type', m.investor_type, f.n ->> 'type'),
    ('Corrected: Country', m.investor_country, f.ctry),
    ('Corrected: City', m.investor_city, f.n ->> 'city'),
    ('Corrected: AUM (USD)', m.aum_usd::text, f.n ->> 'aum_usd'),
    ('Corrected: AUM range', m.aum_band, f.n ->> 'aum_band'),
    ('Filled: Asset classes', case when jlen(m.asset_classes) = 0 then m.asset_classes::text end, case when jlen(m.asset_classes) = 0 and jlen(f.n -> 'asset_classes') > 0 then (f.n -> 'asset_classes')::text end),
    ('Filled: Strategies', case when jlen(m.strategies) = 0 then m.strategies::text end, case when jlen(m.strategies) = 0 and jlen(f.n -> 'strategies') > 0 then (f.n -> 'strategies')::text end),
    ('Filled: Emerging managers', null, case when m.open_to_emerging_managers is null then f.n ->> 'emerging' end)
  ) v(field, o, nv)
 where v.nv is not null and v.o is distinct from v.nv
   and not (v.field = 'Corrected: AUM (USD)' and m.aum_usd is not null and abs(m.aum_usd - (v.nv)::numeric) <= 0.05 * (v.nv)::numeric);

update wi_mandates m set
  view_investor_url = f.n ->> 'link',
  investor_name     = coalesce(f.n ->> 'name', m.investor_name),
  investor_type     = coalesce(f.n ->> 'type', m.investor_type),
  investor_country  = coalesce(f.ctry, m.investor_country),
  investor_city     = coalesce(f.n ->> 'city', m.investor_city),
  aum_usd           = case when (f.n ->> 'aum_usd') is not null and (m.aum_usd is null or abs(m.aum_usd - (f.n ->> 'aum_usd')::numeric) > 0.05 * (f.n ->> 'aum_usd')::numeric) then (f.n ->> 'aum_usd')::numeric else m.aum_usd end,
  aum_band          = coalesce(f.n ->> 'aum_band', m.aum_band),
  asset_classes     = case when jlen(m.asset_classes) = 0 and jlen(f.n -> 'asset_classes') > 0 then f.n -> 'asset_classes' else m.asset_classes end,
  strategies        = case when jlen(m.strategies) = 0 and jlen(f.n -> 'strategies') > 0 then f.n -> 'strategies' else m.strategies end,
  open_to_emerging_managers = coalesce(m.open_to_emerging_managers, (f.n ->> 'emerging')::boolean),
  evidence          = case when jsonb_typeof(m.evidence) = 'object' then m.evidence else '{}'::jsonb end
                      || jsonb_build_object('wi_investor_id', f.new_wi_id)
                      || case when f.summary <> '' then jsonb_build_object('wi_summary', f.summary) else '{}'::jsonb end,
  wi_enriched_at    = now(),
  wi_match_status   = 'Linked',
  wi_match_note     = f.note,
  wi_match_checked_at = now()
  from fx f where m.id = f.mandate_id;


-- ---------------------------------------------------------------------
-- UNDO (from wi_fill_log, source = 'Name search 4 Nov 2026')
--   update wi_mandates m set view_investor_url = null, wi_match_status = 'No link', wi_match_note = null
--     from wi_link_decision d where d.mandate_id = m.id and d.status = 'Linked';
--   ... then 'Corrected: *' / 'Filled: *' rows back to old_value, as in
--   repair-wi-links-2026-11-04.sql.
-- ---------------------------------------------------------------------
