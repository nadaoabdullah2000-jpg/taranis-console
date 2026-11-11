-- 11 Nov 2026, APPROVED by research@taranis.net: the main transaction, ONE transaction for
--   1. the themes/Space fill and the 20 verdict moves (repair-themes-space-fill-2026-11-11.sql, plan
--      table wi_fill_plan_20261111);
--   2. True North (158) and Institute for Advanced Study (398) out of Matched;
--   3. the discovery inserts (repair-discovery-insert-2026-11-11.sql): 74 allocators plus the two
--      consultant-run Mahi funds (Absolute Return Consulting), as Needs data with their With Intelligence link.
-- Backups: wi_mandates_backup_20261111_themes_fill (fill rows + 158, 398). Logged in wi_fill_log.
-- Undo: see the two component files (backup restore for 1-2; inserts marked merged for 3).

begin;
create table wi_mandates_backup_20261111_themes_fill as
  select m.id, m.is_tech_investor, m.tech_signal, m.focus_checks, m.is_space, m.space_signal,
         m.qualification, m.new_qualification, m.new_fit_score, m.fit_reason, m.approved_at, m.approved_by, m.hf_held_verdict, m.hf_held_score
    from wi_mandates m where m.id in (select id from wi_fill_plan_20261111) or m.id in (158, 398);

-- A/B. Technology
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select p.id, p.investor, 'is_tech_investor', 'null' || coalesce(' (check: ' || (p.old_focus_checks->'tech'->>'result') || ')', ''),
       'true (With Intelligence profile (theme line): "' || p.line || '")',
       'Themes read 11 Nov 2026 (approved by research@taranis.net)', p.wi_key
  from wi_fill_plan_20261111 p where p.tech_action = 'tech_yes';
update wi_mandates m set is_tech_investor = true,
       tech_signal = 'With Intelligence profile (theme line): "' || p.line || '"',
       focus_checks = nullif(coalesce(m.focus_checks, '{}'::jsonb) - 'tech', '{}'::jsonb)
  from wi_fill_plan_20261111 p
 where p.id = m.id and p.tech_action = 'tech_yes' and m.is_tech_investor is null;

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select p.id, p.investor, 'focus.tech', coalesce(p.old_focus_checks->'tech'->>'result', 'none'),
       'private_markets_only: themes line only on private equity / venture intentions: "' || left(p.line, 220) || '"',
       'Themes read 11 Nov 2026 (approved by research@taranis.net)', p.wi_key
  from wi_fill_plan_20261111 p where p.tech_action = 'tech_private_only';
update wi_mandates m set focus_checks = coalesce(m.focus_checks, '{}'::jsonb) || jsonb_build_object('tech', jsonb_build_object(
         'result', 'private_markets_only', 'note', left('Themes line only on private equity / venture intentions: "' || p.line || '"', 300),
         'at', now(), 'by', 'themes read'))
  from wi_fill_plan_20261111 p
 where p.id = m.id and p.tech_action = 'tech_private_only' and m.is_tech_investor is null;

-- A/B. Space
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select p.id, p.investor, 'is_space', coalesce(p.old_space::text, 'null') || coalesce(' (' || left(p.old_space_signal, 150) || ')', ''),
       'true (With Intelligence profile (theme line): "' || p.line || '")',
       'Security & Defence theme counts as Space, 11 Nov 2026 (approved by research@taranis.net)', p.wi_key
  from wi_fill_plan_20261111 p where p.space_action = 'space_yes';
update wi_mandates m set is_space = true, space_signal = 'With Intelligence profile (theme line): "' || p.line || '"'
  from wi_fill_plan_20261111 p
 where p.id = m.id and p.space_action = 'space_yes' and coalesce(m.space_signal, '') not like 'Set by a person%';

-- C. Verdicts (the console's rescore; a person's verdict is never changed)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select p.id, p.investor, 'verdict', p.old_q || ' ' || coalesce(p.old_s::text, '-'), p.new_q || ' ' || coalesce(p.new_s::text, '-'),
       'Rescore after the themes fill, 11 Nov 2026 (approved by research@taranis.net)', p.wi_key
  from wi_fill_plan_20261111 p where p.new_q is not null and coalesce(p.verdict_source, '') <> 'manual';
update wi_mandates m set new_qualification = p.new_q, qualification = case when p.new_q in ('matched','rejected') then p.new_q else 'uncertain' end,
       new_fit_score = p.new_s,
       fit_reason = 'Rescored 11 Nov 2026 after the themes-line fill (' || p.old_q || ' -> ' || p.new_q || '). ' || coalesce(m.fit_reason, ''),
       hf_held_verdict = case when p.new_q = 'matched' then null else m.hf_held_verdict end,
       hf_held_score = case when p.new_q = 'matched' then null else m.hf_held_score end
  from wi_fill_plan_20261111 p
 where p.id = m.id and p.new_q is not null and coalesce(m.verdict_source, '') <> 'manual';
-- True North (158) and Institute for Advanced Study (398) out of Matched: neither has a quoted Tech
-- (decided by research@taranis.net, 11 Nov 2026). Backed up above with the fill rows.
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'Verdict', concat_ws(' ', m.new_qualification, coalesce(m.new_fit_score::text, '-')),
       'uncertain ' || least(coalesce(m.new_fit_score, 0.74), 0.74),
       'Match rule 11 Nov 2026 (decided by research@taranis.net): no quoted Technology focus', m.evidence ->> 'wi_investor_id'
  from wi_mandates m where m.id in (158, 398) and m.new_qualification = 'matched' and coalesce(m.verdict_source, '') <> 'manual';
update wi_mandates m set new_qualification = 'uncertain', qualification = 'uncertain',
       new_fit_score = least(coalesce(m.new_fit_score, 0.74), 0.74),
       fit_reason = 'Matched needs long/short and a quoted Technology focus (11 Nov 2026): waiting for a decision. ' || coalesce(m.fit_reason, '')
 where m.id in (158, 398) and m.new_qualification = 'matched' and coalesce(m.verdict_source, '') <> 'manual';

create temp table disc_plan on commit drop as
with direct as (
  select d.wi_id, d.name, d.investor_type, d.country, d.summary, d.asset_classes, d.strategies, d.aum_usd, d.aum_band,
         d.ticket_min_usd, d.ticket_max_usd,
         coalesce(d.profile_url, 'https://platform.withintelligence.com/explore/investors/' || d.wi_id) url, null::text via_fund
    from grok.wi_discovered d
   where (d.investor_type is distinct from 'Fund of Funds'
          or d.wi_id in ('2147325063', '2147325066'))          -- Mahi Alpha Select, Mahi546: consultant-run, added (decided 11 Nov 2026)
     and d.name !~* '^(citadel multi-strategy|quilter investors|millennium management|squarepoint capital)$'
), parents(name, investor_type, country, wi_id, url, via_fund) as (
  values
  -- (firm, type and country as With Intelligence shows them, With Intelligence id, link, fund vehicle(s) it was found through).
  -- Ids from a With Intelligence name search on 11 Nov 2026 (wi_name_lookups).
  ('UBS Asset Management', 'Manager of Managers', 'Switzerland', '1081870399', 'https://platform.withintelligence.com/explore/investors/1081870399', 'A&Q Multi-Strategy Fund; UBS Global Alpha Strategies Fund USD'),
  ('Banque de Luxembourg Investments (BLI)', 'Manager of Managers', 'Luxembourg', '2147332152', 'https://platform.withintelligence.com/explore/investors/2147332152', 'BL Fund Selection Alternative Strategies'),
  ('Candriam', 'Manager of Managers', 'Belgium', '2147318765', 'https://platform.withintelligence.com/explore/investors/2147318765', 'Candriam MM Long/Short Global; Candriam World Alternative Alphamax'),
  ('Cape Capital AG', 'Multi-Family Office', 'Switzerland', '2147324750', 'https://platform.withintelligence.com/explore/investors/2147324750', 'Cape Long/Short Equity Fund'),
  ('Cross Shore Capital Management', 'Manager of Managers', 'United States', '2147318784', 'https://platform.withintelligence.com/explore/investors/2147318784', 'Cross Shore Discovery Fund'),
  ('GCM Grosvenor', 'Manager of Managers', 'United States', '2147318845', 'https://platform.withintelligence.com/explore/investors/2147318845', 'GCM Grosvenor Core Absolute Return Master Fund; GCM Grosvenor Hedge Fund Guided Portfolio Solution'),
  ('Lombard Odier Investment Managers (LOIM)', 'Manager of Managers', 'Switzerland', '2147318890', 'https://platform.withintelligence.com/explore/investors/2147318890', 'LO Multiadvisers - Global Equity Long Short Fund (USD) P A'),
  ('Pictet Alternative Advisors (PAA)', 'Manager of Managers', 'Switzerland', '2147318953', 'https://platform.withintelligence.com/explore/investors/2147318953', 'Mosaic'),
  ('Piguet Galland', 'Private Bank', 'Switzerland', '2147318956', 'https://platform.withintelligence.com/explore/investors/2147318956', 'Piguet Opportunity Fund')
  -- Not added (no firm profile on With Intelligence, so nothing to enrich from): Butterfield Asset
  -- Management (Select Fund share classes), Fundana Asset Management (Prima Capital Fund), SYZ Capital
  -- (only the SYZ Capital Uncorrelated fund has a profile).
  -- Ironwood Institutional Multi-Strategy Fund: its firm, Ironwood Capital Management, is a direct find.
), all_ as (
  select wi_id, name, investor_type, country, summary, asset_classes, strategies, aum_usd, aum_band, ticket_min_usd, ticket_max_usd, url, via_fund from direct
  union all
  select wi_id, name, investor_type, country, null, null, null, null, null, null, null, url, via_fund from parents
)
select a.*, case a.country when 'United States' then 'US' when 'United Kingdom' then 'GB' when 'Canada' then 'CA' when 'Luxembourg' then 'LU'
         when 'Spain' then 'ES' when 'France' then 'FR' when 'Belgium' then 'BE' when 'Switzerland' then 'CH' when 'Austria' then 'AT'
         when 'Singapore' then 'SG' when 'Norway' then 'NO' when 'Bermuda' then 'BM' when 'South Africa' then 'ZA' end cc
  from all_ a
 where not exists (select 1 from wi_mandates m where a.wi_id is not null and m.evidence->>'wi_investor_id' = a.wi_id)
   and not exists (select 1 from wi_mandates m
                    where wi_name_key(coalesce(nullif(btrim(m.investor_name),''), m.organization_name)) = wi_name_key(a.name));

insert into wi_mandates (record_key, source_message_id, investor_name, investor_type, investor_country, asset_classes, strategies,
                         aum_usd, aum_band, ticket_min_usd, ticket_max_usd, view_investor_url, evidence, qualification, new_qualification,
                         new_fit_score, fit_reason, source_kind, alert_type, alert_date)
select 'disc-' || coalesce(p.wi_id, md5(p.name)), 'discovery:' || coalesce(p.wi_id, p.name), p.name, p.investor_type, p.cc,
       coalesce(p.asset_classes, '[]'::jsonb), coalesce(p.strategies, '[]'::jsonb), p.aum_usd, p.aum_band, p.ticket_min_usd, p.ticket_max_usd, p.url,
       jsonb_strip_nulls(jsonb_build_object('wi_investor_id', p.wi_id, 'wi_summary', p.summary,
         'discovery', jsonb_strip_nulls(jsonb_build_object('found', '2026-11-11', 'preset', 'first discovery pass', 'via_fund', p.via_fund,
           'consultant_run', case when p.wi_id in ('2147325063', '2147325066') then 'Absolute Return Consulting' end)))),
       'uncertain', 'needs_data', null,
       case when p.wi_id in ('2147325063', '2147325066') then 'Consultant-run (Absolute Return Consulting): a fund of hedge funds overseen by a consultant. ' else '' end
       || 'Found by the With Intelligence discovery search (11 Nov 2026)' || coalesce('; the firm behind ' || p.via_fund, '') || ': needs data.',
       'import', 'Discovery find', current_date
  from disc_plan p;

update grok.wi_discovered d set review_status = 'imported', reviewed_at = now(), reviewed_by = 'research (approved 11 Nov 2026)'
 where exists (select 1 from wi_mandates m where m.record_key = 'disc-' || d.wi_id);
commit;
