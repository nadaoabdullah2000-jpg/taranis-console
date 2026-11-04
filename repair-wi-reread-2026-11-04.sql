-- Repair 4 Nov 2026: fill missing allocator data from With Intelligence.
--
-- WI 01d (workflow umIcE6l9pLFuC5JH) read every allocator's profile from
-- With Intelligence (by its stored link, or by an exact name match) into
-- wi_profile_reads. This file:
--   1. adds wi_mandates.min_manager_aum_usd (the smallest fund size the
--      allocator will back, from the profile's fund-size preference);
--   2. corrects AUM stored in millions: WI 01c wrote latest_aum.value_usd,
--      which With Intelligence gives in millions of USD, as dollars
--      (CalSTRS 421,540 = $421.5bn). Only rows WI 01c enriched with a value
--      under 10 million are scaled, and each change is logged;
--   3. fills only EMPTY fields from the newest successful read of the same
--      company: investor type, city, country, asset classes, strategies,
--      AUM, AUM range, minimum and maximum ticket, minimum manager AUM,
--      emerging managers (only where the profile says so in words), and the
--      With Intelligence link. Nothing that has a value is overwritten.
-- Verdicts (qualification, new_qualification, fit scores) are NOT touched:
-- moves between Opportunities and Rejected are decided by a person.
-- Every change is written to wi_fill_log (old value, new value, source) and
-- can be undone with the UNDO section at the end. Safe to run twice: the
-- second run finds nothing empty to fill.

alter table public.wi_mandates add column if not exists min_manager_aum_usd numeric;

-- ---------------------------------------------------------------------
-- 1. AUM UNITS
-- ---------------------------------------------------------------------
with fix as (
  update wi_mandates m set aum_usd = m.aum_usd * 1000000
   where m.wi_enriched_at is not null and m.aum_usd > 0 and m.aum_usd < 10000000
     and not exists (select 1 from wi_fill_log l where l.mandate_id = m.id and l.field = 'aum_usd (unit fix)')
  returning m.id, m.investor_name, m.aum_usd
)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'aum_usd (unit fix)', (aum_usd / 1000000)::text, aum_usd::text,
       'With Intelligence gives AUM in millions; stored without conversion by WI 01c'
  from fix;

-- ---------------------------------------------------------------------
-- 2. FILL EMPTY FIELDS
-- ---------------------------------------------------------------------
create or replace function public.wi_fill_from_reads(p_since timestamptz)
returns int language plpgsql as $$
declare
  r record; n int := 0; v jsonb; empty_arr boolean;
begin
  for r in
    with latest as (
      select distinct on (company_key) company_key, wi_investor_id, method, payload -> 'norm' as nm
        from wi_profile_reads
       where status = 'ok' and read_at >= p_since and payload ? 'norm'
       order by company_key, read_at desc)
    select m.id, m.investor_name, l.wi_investor_id, l.method, l.nm,
           m.investor_type, m.investor_city, m.investor_country, m.asset_classes, m.strategies, m.aum_usd, m.aum_band,
           m.ticket_min_usd, m.ticket_max_usd, m.min_manager_aum_usd, m.open_to_emerging_managers, m.view_investor_url
      from wi_mandates m
      join latest l on l.company_key = lower(btrim(coalesce(nullif(btrim(m.investor_name), ''), m.organization_name)))
     where coalesce(m.validation_status, '') <> 'pending'
  loop
    -- text fields
    if nullif(btrim(r.investor_type), '') is null and nullif(r.nm ->> 'type', '') is not null then
      update wi_mandates set investor_type = r.nm ->> 'type' where id = r.id;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id) values (r.id, r.investor_name, 'Investor type', r.investor_type, r.nm ->> 'type', r.wi_investor_id); n := n + 1;
    end if;
    if nullif(btrim(r.investor_city), '') is null and nullif(r.nm ->> 'city', '') is not null then
      update wi_mandates set investor_city = r.nm ->> 'city' where id = r.id;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id) values (r.id, r.investor_name, 'City', r.investor_city, r.nm ->> 'city', r.wi_investor_id); n := n + 1;
    end if;
    if nullif(btrim(r.investor_country), '') is null and nullif(r.nm ->> 'country', '') is not null then
      update wi_mandates set investor_country = r.nm ->> 'country' where id = r.id;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id) values (r.id, r.investor_name, 'Country', r.investor_country, r.nm ->> 'country', r.wi_investor_id); n := n + 1;
    end if;
    -- lists: only when the row has none
    empty_arr := r.asset_classes is null or r.asset_classes in ('[]'::jsonb, '""'::jsonb, 'null'::jsonb)
                 or (jsonb_typeof(r.asset_classes) = 'string' and r.asset_classes #>> '{}' in ('', '[]'));
    if empty_arr and jsonb_array_length(coalesce(r.nm -> 'asset_classes', '[]')) > 0 then
      update wi_mandates set asset_classes = r.nm -> 'asset_classes' where id = r.id;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id) values (r.id, r.investor_name, 'Asset classes', null, (select string_agg(x, ', ') from jsonb_array_elements_text(r.nm -> 'asset_classes') x), r.wi_investor_id); n := n + 1;
    end if;
    empty_arr := r.strategies is null or r.strategies in ('[]'::jsonb, '""'::jsonb, 'null'::jsonb)
                 or (jsonb_typeof(r.strategies) = 'string' and r.strategies #>> '{}' in ('', '[]'));
    if empty_arr and jsonb_array_length(coalesce(r.nm -> 'strategies', '[]')) > 0 then
      update wi_mandates set strategies = r.nm -> 'strategies' where id = r.id;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id) values (r.id, r.investor_name, 'Strategies', null, (select string_agg(x, ', ') from jsonb_array_elements_text(r.nm -> 'strategies') x), r.wi_investor_id); n := n + 1;
    end if;
    -- money (already converted to USD by the reader)
    if coalesce(r.aum_usd, 0) <= 0 and (r.nm ->> 'aum_usd') is not null then
      update wi_mandates set aum_usd = (r.nm ->> 'aum_usd')::numeric where id = r.id;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id) values (r.id, r.investor_name, 'AUM (USD)', r.aum_usd::text, r.nm ->> 'aum_usd', r.wi_investor_id); n := n + 1;
    end if;
    if nullif(btrim(r.aum_band), '') is null and nullif(r.nm ->> 'aum_band', '') is not null then
      update wi_mandates set aum_band = r.nm ->> 'aum_band' where id = r.id;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id) values (r.id, r.investor_name, 'AUM range', r.aum_band, r.nm ->> 'aum_band', r.wi_investor_id); n := n + 1;
    end if;
    -- tickets only where they stay consistent with what the row already has (min <= max)
    if coalesce(r.ticket_min_usd, 0) <= 0 and (r.nm ->> 'ticket_min_usd') is not null
        and (coalesce(r.ticket_max_usd, 0) <= 0 or (r.nm ->> 'ticket_min_usd')::numeric <= r.ticket_max_usd) then
      update wi_mandates set ticket_min_usd = (r.nm ->> 'ticket_min_usd')::numeric where id = r.id;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id) values (r.id, r.investor_name, 'Minimum ticket (USD)', r.ticket_min_usd::text, r.nm ->> 'ticket_min_usd', r.wi_investor_id); n := n + 1;
    end if;
    if coalesce(r.ticket_max_usd, 0) <= 0 and (r.nm ->> 'ticket_max_usd') is not null
        and (r.nm ->> 'ticket_max_usd')::numeric >= coalesce((select ticket_min_usd from wi_mandates where id = r.id), 0) then
      update wi_mandates set ticket_max_usd = (r.nm ->> 'ticket_max_usd')::numeric where id = r.id;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id) values (r.id, r.investor_name, 'Maximum ticket (USD)', r.ticket_max_usd::text, r.nm ->> 'ticket_max_usd', r.wi_investor_id); n := n + 1;
    end if;
    if r.min_manager_aum_usd is null and (r.nm ->> 'min_manager_aum_usd') is not null then
      update wi_mandates set min_manager_aum_usd = (r.nm ->> 'min_manager_aum_usd')::numeric where id = r.id;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id) values (r.id, r.investor_name, 'Minimum manager AUM (USD)', null, r.nm ->> 'min_manager_aum_usd', r.wi_investor_id); n := n + 1;
    end if;
    -- emerging managers: only an explicit statement in the profile
    if r.open_to_emerging_managers is null and jsonb_typeof(r.nm -> 'emerging') = 'boolean' then
      update wi_mandates set open_to_emerging_managers = (r.nm ->> 'emerging')::boolean where id = r.id;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id) values (r.id, r.investor_name, 'Invests in emerging managers', null,
        case when (r.nm ->> 'emerging')::boolean then 'Yes' else 'No' end, 'With Intelligence profile: ' || coalesce(r.nm ->> 'emerging_why', ''), r.wi_investor_id); n := n + 1;
    end if;
    -- link
    if nullif(btrim(r.view_investor_url), '') is null and nullif(r.nm ->> 'link', '') is not null then
      update wi_mandates set view_investor_url = r.nm ->> 'link' where id = r.id;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id) values (r.id, r.investor_name, 'With Intelligence link', null, r.nm ->> 'link',
        case r.method when 'name_exact' then 'With Intelligence search: exact name match' else 'With Intelligence profile' end, r.wi_investor_id); n := n + 1;
    end if;
  end loop;
  return n;
end $$;

select public.wi_fill_from_reads('2026-11-04 11:00+00');

-- ---------------------------------------------------------------------
-- UNDO (restores every value this file set, from wi_fill_log)
--   update wi_mandates m set aum_usd = l.old_value::numeric from wi_fill_log l
--    where l.mandate_id = m.id and l.field = 'aum_usd (unit fix)';
--   update wi_mandates m set
--     investor_type   = case when l.field = 'Investor type' then l.old_value else m.investor_type end,
--     investor_city   = case when l.field = 'City' then l.old_value else m.investor_city end,
--     investor_country= case when l.field = 'Country' then l.old_value else m.investor_country end,
--     asset_classes   = case when l.field = 'Asset classes' then '[]'::jsonb else m.asset_classes end,
--     strategies      = case when l.field = 'Strategies' then '[]'::jsonb else m.strategies end,
--     aum_usd         = case when l.field = 'AUM (USD)' then l.old_value::numeric else m.aum_usd end,
--     aum_band        = case when l.field = 'AUM range' then l.old_value else m.aum_band end,
--     ticket_min_usd  = case when l.field = 'Minimum ticket (USD)' then l.old_value::numeric else m.ticket_min_usd end,
--     ticket_max_usd  = case when l.field = 'Maximum ticket (USD)' then l.old_value::numeric else m.ticket_max_usd end,
--     min_manager_aum_usd = case when l.field = 'Minimum manager AUM (USD)' then null else m.min_manager_aum_usd end,
--     open_to_emerging_managers = case when l.field = 'Invests in emerging managers' then null else m.open_to_emerging_managers end,
--     view_investor_url = case when l.field = 'With Intelligence link' then null else m.view_investor_url end
--   from wi_fill_log l where l.mandate_id = m.id and l.filled_at >= '2026-11-04';
--   (run once per field if a row had several fills: repeat until 0 rows change)
-- ---------------------------------------------------------------------
