-- Repair 4 Nov 2026 (evening): every allocator's With Intelligence link checked.
--
-- Why: MassPRIM's "View intention" and "View article" buttons opened
-- Rockefeller Global Family Office's items. The alert-email reader gives a
-- "Mandate has been updated/added" item the NEXT item's intention and article
-- links. This morning's profile re-read also checked one link per allocator
-- name, not each row's own link.
--
-- What was checked (tables kept for the record):
--   wi_link_checks    each row's own "Investor page" link, followed to the
--                     With Intelligence profile it really opens (name, type,
--                     country, city);
--   wi_link_audit     that profile vs the allocator's ORIGINAL name (before
--                     this morning's renames), type and country;
--   wi_link_fix       With Intelligence's own name search for every link that
--                     was wrong, dead, deleted or not a With Intelligence link;
--   wi_link_decision  Fixed (new profile) / Not found, with the reason.
-- Every change below is logged in wi_fill_log (source 'Link check 4 Nov 2026').
-- Verdicts are NOT changed here (see the separate re-scoring step).

-- helper: number of values in a jsonb list (a single string counts as one)
create or replace function jlen(x jsonb) returns int language sql immutable as $$
  select case coalesce(jsonb_typeof(x), 'null') when 'array' then jsonb_array_length(x) when 'string' then case when btrim(x #>> '{}') <> '' then 1 else 0 end when 'null' then 0 else 1 end $$;
alter table wi_mandates add column if not exists wi_match_status text;
alter table wi_mandates add column if not exists wi_match_note text;
alter table wi_mandates add column if not exists wi_match_checked_at timestamptz;

-- ---------------------------------------------------------------------
-- 1. FIXED: replace the link and refresh from the correct profile
-- ---------------------------------------------------------------------
create temp table fx as
select d.mandate_id, d.new_wi_id, d.note, p.payload -> 'norm' as n,
       case p.payload -> 'norm' ->> 'country' when 'UK' then 'GB' when 'FX' then 'FR' else p.payload -> 'norm' ->> 'country' end as ctry,
       btrim(regexp_replace(regexp_replace(coalesce(p.payload -> 'raw' ->> 'summary', ''), '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')) as summary
  from wi_link_decision d join iconn_wi_profiles p on p.wi_id = d.new_wi_id and p.status = 'ok'
 where d.status = 'Fixed';

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, f.n ->> 'name', v.field, v.o, v.nv, 'Link check 4 Nov 2026', f.new_wi_id
  from fx f join wi_mandates m on m.id = f.mandate_id,
  lateral (values
    ('Link fixed: Investor page', m.view_investor_url, f.n ->> 'link'),
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
  wi_match_status   = 'Fixed',
  wi_match_note     = f.note,
  wi_match_checked_at = now()
  from fx f where m.id = f.mandate_id;

-- ---------------------------------------------------------------------
-- 2. NOT FOUND: remove the link, mark it
-- ---------------------------------------------------------------------
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select m.id, m.investor_name, 'Link removed: Investor page', m.view_investor_url, null, 'Link check 4 Nov 2026: ' || d.note
  from wi_link_decision d join wi_mandates m on m.id = d.mandate_id where d.status = 'Not found';
update wi_mandates m set view_investor_url = null, wi_match_status = 'Not found', wi_match_note = d.note, wi_match_checked_at = now()
  from wi_link_decision d where d.mandate_id = m.id and d.status = 'Not found';

-- ---------------------------------------------------------------------
-- 3. CORRECT: every other row whose own link opens the same organisation
-- ---------------------------------------------------------------------
update wi_mandates m set wi_match_status = 'Correct', wi_match_checked_at = now(),
       wi_match_note = 'Link opens ' || a.wi_name || ' (' || coalesce(a.wi_type, '?') || ', ' || coalesce(a.wi_country, '?') || ')'
  from wi_link_audit a
 where a.id = m.id and a.status = 'ok' and a.k in ('same', 'contains', 'same_acronym', 'differs')
   and m.id not in (select mandate_id from wi_link_decision);
update wi_mandates set wi_match_status = 'No link', wi_match_checked_at = now()
 where coalesce(validation_status, '') <> 'pending' and nullif(btrim(view_investor_url), '') is null and wi_match_status is null;

-- names written exactly as on With Intelligence
with u as (
  update wi_mandates m set investor_name = a.wi_name from wi_link_audit a
   where a.id = m.id and m.wi_match_status = 'Correct' and m.investor_name is distinct from a.wi_name
  returning m.id, a.tool_name, a.wi_name, a.wi_id)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, wi_name, 'Corrected: Name', tool_name, wi_name, 'Link check 4 Nov 2026: name exactly as on With Intelligence', wi_id from u;

-- Hong Kong rows with no country
with u as (
  update wi_mandates m set investor_country = 'HK' from wi_link_audit a
   where a.id = m.id and a.wi_country = 'Hong Kong' and nullif(btrim(m.investor_country), '') is null
  returning m.id, m.investor_name)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Filled: Country', null, 'HK', 'Link check 4 Nov 2026' from u;

-- ---------------------------------------------------------------------
-- 4. INTENTION / ARTICLE LINKS taken from the next item of the same email
-- ---------------------------------------------------------------------
create temp table lk as
select m.id, m.investor_name, m.view_intention_url as old_int, m.view_article_url as old_art,
       (select x ->> 'url' from jsonb_array_elements(m.source_links) x where x ->> 'label' = 'View mandate' limit 1) as mandate_url
  from wi_mandates m where m.id in (189, 199, 209, 247, 323);
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Link fixed: View intention', old_int, mandate_url, 'Link check 4 Nov 2026: intention belonged to the next item of the alert email'
  from lk where mandate_url is not null and old_int is distinct from mandate_url
union all
select id, investor_name, 'Link removed: View article', old_art, null, 'Link check 4 Nov 2026: article is about another organisation'
  from lk where old_art is not null and id in (189, 209, 247, 323);
update wi_mandates m set view_intention_url = lk.mandate_url from lk where lk.id = m.id and lk.mandate_url is not null;
update wi_mandates m set view_article_url = null where m.id in (189, 209, 247, 323);
-- Rockefeller Global Family Office gets its own article back
with u as (
  update wi_mandates m set view_article_url = lk.old_art from lk
   where m.id = 325 and lk.id = 323 and m.view_article_url is null and lk.old_art is not null
  returning m.id, m.investor_name, m.view_article_url)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Link fixed: View article', null, view_article_url, 'Link check 4 Nov 2026: article "Rockefeller GFO favors multi-strats, macro and equity long/short"' from u;

-- ---------------------------------------------------------------------
-- 5. I-CONNECTIONS rows follow the corrected names
-- ---------------------------------------------------------------------
update iconnections_import_rows r set matched_name = m.investor_name
  from wi_mandates m where m.id = r.matched_id and r.matched_name is distinct from m.investor_name;

-- ---------------------------------------------------------------------
-- 6. CRITERIA RE-RUN for the 95 changed rows (applied as
--    repair_wi_links_verdicts_2026_11_04). Nobody moves between Opportunities
--    and Rejected. Three verdicts change inside Opportunities:
--      189, 199 Dallas Employees' Retirement Fund: needs data -> matched 0.95
--      1377 University of Minnesota: needs data -> review 0.65 (Space)
--    Rows with a verdict a person set (Carson Group 942, FinTech Law 247,
--    McKnight 1384, Textron 1385, Rotary 1369) keep it.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- UNDO (from wi_fill_log, source like 'Link check 4 Nov 2026%')
--   update wi_mandates m set view_investor_url = l.old_value from wi_fill_log l
--    where l.mandate_id = m.id and l.source like 'Link check 4 Nov 2026%'
--      and l.field in ('Link fixed: Investor page', 'Link removed: Investor page');
--   ... the same for 'Corrected: Name' (investor_name), 'Corrected: Investor type',
--   'Corrected: Country', 'Corrected: City', 'Corrected: AUM (USD)' (::numeric),
--   'Corrected: AUM range', 'Filled: *' (set back to old_value / null),
--   'Link fixed: View intention' (view_intention_url), 'Link removed: View article'
--   and 'Link fixed: View article' (view_article_url);
--   update wi_mandates set wi_match_status = null, wi_match_note = null, wi_match_checked_at = null;
-- ---------------------------------------------------------------------
