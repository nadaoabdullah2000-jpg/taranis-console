-- Repair 4 Nov 2026 (afternoon): full data check against With Intelligence,
-- and the Space criterion.
--
-- Source: the profiles WI 01d read today (wi_profile_reads) and their
-- sectors / industries / attributes (wi_space_reads). Only values With
-- Intelligence returned are used. Every change is logged in wi_fill_log
-- ("Corrected: <field>" for a wrong value, "Space" for the new signal) and the
-- UNDO section restores the old values. Verdicts are not touched.
--
-- 1. SPACE: wi_mandates.is_space / space_signal for every allocator.
--    Yes   = With Intelligence lists the Aerospace industry, or the profile or
--            the alert text speaks of space (space economy / technology /
--            sector, satellites, aerospace, orbital, launch vehicles ...);
--    No    = there is information (a profile, sectors or alert text) and
--            none of it mentions space;
--    null  = no information at all ("Unknown").
-- 2. CORRECTIONS where the stored value contradicts the profile the
--    allocator's own With Intelligence link opens:
--    name (headline fragments saved as names, renamed organisations),
--    country (codes built from the first two letters of the country name:
--    Chile as CH, South Korea as SO, New Zealand as NE ...; and this
--    morning's UK / FX, which are GB / FR), investor type, city, and AUM /
--    AUM range (WI's latest figure).

-- ---------------------------------------------------------------------
-- 1. SPACE
-- ---------------------------------------------------------------------
create temp table space_re as select
  '\m(space (economy|technology|technologies|tech|sector|industry|exploration|infrastructure|companies|startups?|ventures?|investing|investments?|theme)|spacetech|new space|outer space|satellites?|aerospace|orbital|launch vehicles?|space-related|space and defen[cs]e)\M'::text as re;

with latest as (
  select distinct on (company_key) company_key, wi_investor_id
    from wi_profile_reads where status = 'ok' order by company_key, read_at desc),
prof as (
  select l.company_key, s.sectors, s.industries, s.summary
    from latest l join wi_space_reads s on s.wi_id = l.wi_investor_id and s.status = 'ok'),
m as (
  select m.id, m.investor_name,
         lower(btrim(coalesce(nullif(btrim(m.investor_name), ''), m.organization_name))) as k,
         concat_ws(' ', m.intention_summary, m.requirements_raw, m.appetite_raw,
                   case when jsonb_typeof(m.evidence) = 'object' then m.evidence ->> 'wi_summary' end) as txt
    from wi_mandates m where coalesce(m.validation_status, '') <> 'pending'),
j as (
  select m.id, m.investor_name, m.txt, p.sectors, p.industries, p.summary, p.company_key is not null as has_profile,
         (select x from jsonb_array_elements_text(coalesce(p.industries, '[]') || coalesce(p.sectors, '[]')) x
           where x ~* '\maerospace\M' limit 1) as sector_hit,
         substring(coalesce(p.summary, '') from (select re from space_re)) as profile_hit,
         substring(coalesce(m.txt, '') from (select re from space_re)) as text_hit
    from m left join prof p on p.company_key = m.k),
v as (
  select id, investor_name,
         case when sector_hit is not null or profile_hit is not null or text_hit is not null then true
              when has_profile or btrim(coalesce(txt, '')) <> '' then false end as val,
         case when sector_hit is not null then 'With Intelligence industry: ' || sector_hit
              when profile_hit is not null then 'With Intelligence profile mentions "' || profile_hit || '"'
              when text_hit is not null then 'Alert text mentions "' || text_hit || '"'
              when has_profile then 'With Intelligence profile and alert text: no space'
              when btrim(coalesce(txt, '')) <> '' then 'Alert text: no space (no With Intelligence profile)' end as why
    from j),
upd as (
  update wi_mandates w set is_space = v.val, space_signal = v.why
    from v where w.id = v.id and (w.is_space is distinct from v.val or w.space_signal is distinct from v.why)
  returning w.id, w.investor_name, v.val, v.why)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Space', null, case when val then 'Yes' when val = false then 'No' else 'Unknown' end, coalesce(why, 'no information') from upd;

-- ---------------------------------------------------------------------
-- 2. CORRECTIONS (the profile the allocator's link opens)
-- ---------------------------------------------------------------------
create temp table fixes as
with latest as (
  select distinct on (company_key) company_key, wi_investor_id, payload -> 'norm' as n
    from wi_profile_reads where status = 'ok' order by company_key, read_at desc)
select m.id, m.investor_name, l.wi_investor_id,
       m.investor_name as old_name, l.n ->> 'name' as wi_name,
       m.investor_country as old_country,
       case l.n ->> 'country' when 'UK' then 'GB' when 'FX' then 'FR' else l.n ->> 'country' end as wi_country,
       m.investor_type as old_type, l.n ->> 'type' as wi_type,
       m.investor_city as old_city, l.n ->> 'city' as wi_city,
       m.aum_usd as old_aum, (l.n ->> 'aum_usd')::numeric as wi_aum,
       m.aum_band as old_band, l.n ->> 'aum_band' as wi_band
  from wi_mandates m
  join latest l on l.company_key = lower(btrim(coalesce(nullif(btrim(m.investor_name), ''), m.organization_name)))
 where coalesce(m.validation_status, '') <> 'pending';

-- names
with u as (
  update wi_mandates w set investor_name = f.wi_name from fixes f
   where w.id = f.id and f.wi_name is not null
     and regexp_replace(lower(regexp_replace(f.wi_name, '\([^)]*\)', '', 'g')), '[^a-z0-9]', '', 'g')
      <> regexp_replace(lower(regexp_replace(coalesce(f.old_name, ''), '\([^)]*\)', '', 'g')), '[^a-z0-9]', '', 'g')
  returning w.id, f.old_name, f.wi_name, f.wi_investor_id)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, wi_name, 'Corrected: Name', old_name, wi_name, 'With Intelligence profile the allocator''s link opens', wi_investor_id from u;
-- country
with u as (
  update wi_mandates w set investor_country = f.wi_country from fixes f
   where w.id = f.id and f.wi_country is not null and nullif(btrim(f.old_country), '') is not null
     and upper(btrim(f.old_country)) <> f.wi_country
     and not (upper(btrim(f.old_country)) = 'UK' and f.wi_country = 'GB')
  returning w.id, w.investor_name, f.old_country, f.wi_country, f.wi_investor_id)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id)
select id, investor_name, 'Corrected: Country', old_country, wi_country, wi_investor_id from u;
-- this morning's UK / FX codes on rows without a profile match above
with u as (
  update wi_mandates w set investor_country = case upper(btrim(w.investor_country)) when 'UK' then 'GB' else 'FR' end
   where upper(btrim(w.investor_country)) in ('UK', 'FX')
  returning w.id, w.investor_name, w.investor_country)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Corrected: Country', case investor_country when 'GB' then 'UK' else 'FX' end, investor_country, 'Standard ISO code' from u;
-- type
with u as (
  update wi_mandates w set investor_type = f.wi_type from fixes f
   where w.id = f.id and f.wi_type is not null and nullif(btrim(f.old_type), '') is not null
     and lower(btrim(f.old_type)) <> lower(f.wi_type)
  returning w.id, w.investor_name, f.old_type, f.wi_type, f.wi_investor_id)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id)
select id, investor_name, 'Corrected: Investor type', old_type, wi_type, wi_investor_id from u;
-- city
with u as (
  update wi_mandates w set investor_city = f.wi_city from fixes f
   where w.id = f.id and f.wi_city is not null and nullif(btrim(f.old_city), '') is not null
     and lower(btrim(f.old_city)) <> lower(f.wi_city)
  returning w.id, w.investor_name, f.old_city, f.wi_city, f.wi_investor_id)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id)
select id, investor_name, 'Corrected: City', old_city, wi_city, wi_investor_id from u;
-- AUM (more than 5% away from With Intelligence's latest figure) and its range
with u as (
  update wi_mandates w set aum_usd = f.wi_aum, aum_band = coalesce(f.wi_band, w.aum_band) from fixes f
   where w.id = f.id and f.wi_aum is not null and f.old_aum > 0
     and abs(f.old_aum - f.wi_aum) > 0.05 * f.wi_aum
  returning w.id, w.investor_name, f.old_aum, f.wi_aum, f.old_band, f.wi_band, f.wi_investor_id)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id)
select id, investor_name, 'Corrected: AUM (USD)', old_aum::text, wi_aum::text, wi_investor_id from u
union all
select id, investor_name, 'Corrected: AUM range', old_band, wi_band, wi_investor_id from u
 where wi_band is not null and old_band is distinct from wi_band;

-- ---------------------------------------------------------------------
-- 3. FIXUPS (applied the same afternoon)
-- ---------------------------------------------------------------------
-- Pitcairn keeps the name chosen on 2 Nov 2026, not With Intelligence's legal name.
with u as (
  update wi_mandates m set investor_name = 'Pitcairn' from wi_fill_log l
   where l.mandate_id = m.id and l.field = 'Corrected: Name' and l.old_value = 'Pitcairn' and m.investor_name = 'Pitcairn Wealth Advisors LLC'
  returning m.id)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, 'Pitcairn', 'Corrected: Name (reverted)', 'Pitcairn Wealth Advisors LLC', 'Pitcairn', 'Name chosen by the user on 2 Nov 2026' from u;
-- "satellite allocations / funds" is portfolio language, not space: only
-- satellite operators, companies, communications, launches, imagery ... count.
-- (Recomputed for the rows the first pass marked on "satellite"; see the
-- migration repair_wi_check_fixups for the exact statement.)

-- ---------------------------------------------------------------------
-- UNDO (from wi_fill_log; run for each field)
--   update wi_mandates m set investor_name = l.old_value from wi_fill_log l
--    where l.mandate_id = m.id and l.field = 'Corrected: Name';
--   ... the same for 'Corrected: Country' (investor_country), 'Corrected: Investor type'
--   (investor_type), 'Corrected: City' (investor_city), 'Corrected: AUM (USD)'
--   (aum_usd = old_value::numeric), 'Corrected: AUM range' (aum_band);
--   update wi_mandates set is_space = null, space_signal = null;
-- ---------------------------------------------------------------------
