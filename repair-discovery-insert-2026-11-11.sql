-- 11 Nov 2026 (DRAFT, NOT APPLIED; for research@taranis.net to approve): add the genuinely new
-- allocators from the first discovery pass (grok.wi_discovered, 99 staged) to Opportunities as
-- "Needs data", with their With Intelligence link, so they can be enriched.
-- Dry run: 74 rows = 65 allocators found directly + 9 firms behind fund vehicles (With Intelligence
-- id from a name search).
--
-- Left out:
--   * 13 already in the list (matched by With Intelligence id first, then by name, any verdict):
--     Colorado FPPA, Geraldine R. Dodge Foundation, JP Morgan Private Bank, Kaiser Permanente,
--     Millennium Management, MOSERS, Oregon PERF, RBC Brewin Dolphin, Squarepoint Capital,
--     The Golden LEAF Foundation, The University of Chicago, University of Kentucky, Wyoming RS.
--   * Funds / managers, not allocators: Citadel Multi-Strategy (a South African hedge fund);
--     Millennium and Squarepoint are among the 13 above.
--   * Quilter Investors: Quilter is in the list already (row 752, rejected).
--   * Fund vehicles and share classes (19): not added themselves; the firm behind each is added
--     once where it has its own With Intelligence profile (9 firms, see parents). Mahi546 (no summary) and Mahi Alpha Select (overseen by
--     Absolute Return Consulting, a consultant, not an allocator) add nothing.
-- Nothing is matched or merged into an existing row; a later match by id or name is checked again
-- inside the transaction, so a row added since the dry run is never duplicated.
-- Verdict: new_qualification = 'needs_data', qualification = 'uncertain' (the legacy column has no
-- needs_data), no score. source_kind = 'import', alert_type = 'Discovery find'.
-- ONE transaction. Nothing deleted. Undo: delete is not allowed, so the undo marks the rows merged
-- away (validation_status = 'merged', merged_into = null) and resets grok.wi_discovered.review_status.

begin;
create temp table disc_plan on commit drop as
with direct as (
  select d.wi_id, d.name, d.investor_type, d.country, d.summary, d.asset_classes, d.strategies, d.aum_usd, d.aum_band,
         d.ticket_min_usd, d.ticket_max_usd,
         coalesce(d.profile_url, 'https://platform.withintelligence.com/explore/investors/' || d.wi_id) url, null::text via_fund
    from grok.wi_discovered d
   where d.investor_type is distinct from 'Fund of Funds'
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
         'discovery', jsonb_build_object('found', '2026-11-11', 'preset', 'first discovery pass', 'via_fund', p.via_fund))),
       'uncertain', 'needs_data', null,
       'Found by the With Intelligence discovery search (11 Nov 2026)' || coalesce('; the firm behind ' || p.via_fund, '') || ': needs data.',
       'import', 'Discovery find', current_date
  from disc_plan p;

update grok.wi_discovered d set review_status = 'added', reviewed_at = now(), reviewed_by = 'research (approved 11 Nov 2026)'
 where exists (select 1 from wi_mandates m where m.record_key = 'disc-' || d.wi_id);
commit;

-- UNDO (no deletes): update wi_mandates set validation_status = 'merged', fit_reason = 'Undone: discovery insert 11 Nov 2026. ' || fit_reason
--                      where record_key like 'disc-%' and alert_type = 'Discovery find';
--                    update grok.wi_discovered set review_status = null, reviewed_at = null, reviewed_by = null where review_status = 'added';
