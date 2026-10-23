-- =====================================================================
-- enrich-2026-10-23.sql — fill is_tech_investor / tech_signal and backfill
-- open_to_emerging_markets on wi_mandates, from evidence in the text only.
--
-- Run AFTER schema-13-enrich-and-search.sql. NOT RUN YET: the dry-run counts
-- and samples were shown first; this runs only on an explicit go.
--
-- How it stays auditable and reversible:
--   1. Every row it will touch is copied, whole, into
--      wi_mandates_snap_20261023_enrich (plus the proposed values and the
--      evidence) before any UPDATE, the way earlier snapshots were made.
--   2. The UPDATEs join that snapshot by id and only write where the target
--      column is still NULL, so no row outside the snapshot changes and no
--      value set since (by hand or by WI 01) is overwritten.
--   3. Each written value also records itself in field_sources
--      ({at, by, via, was, evidence}), the same shape the console uses.
--   4. The audit_row trigger logs every changed field to audit_log as well.
--   5. A rollback block at the bottom undoes exactly what this wrote.
--
-- Classification (all matching on lower()'d text, so casing never matters):
--   tech  true  : a technology / software / fintech / TMT / AI / cyber term in
--                 intention_summary, appetite_raw, requirements_raw,
--                 strategies or asset_classes — after the console's isTech()
--                 cleaning (refusal clauses, plan names, bare "technologies"
--                 dropped first)
--         false : technology turned away ("avoid … software and technology"),
--                 or every stated asset class / strategy is a non-tech sector
--                 (real estate, infrastructure, private debt, fixed income …)
--         NULL  : no signal; news or a manager launch rather than an investor
--                 (the console's isNotMandate); AI/fintech only inside WI's
--                 "primary investment themes include A, B, C…" list; or mixed
--   EM    true  : "emerging/frontier markets", "EM debt/equity/…", or an EM
--                 region in a sentence about where money goes (not where the
--                 investor is based; the investor's own name is removed first)
--         false : EM or an EM region turned away ("does not invest in Africa")
--         NULL  : everything else, including EM domicile alone
--   Only rows where open_to_emerging_markets is NULL today are considered.
-- =====================================================================

begin;

-- 0. Guards: stop if the schema is not in place or a trigger would refuse.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'wi_mandates'
                    and column_name = 'is_tech_investor') then
    raise exception 'Run schema-13-enrich-and-search.sql first.';
  end if;
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'wi_mandates_snap_20261023_enrich') then
    raise exception 'wi_mandates_snap_20261023_enrich already exists: this script has run before.';
  end if;
  -- mandate_guard() recomputes intake_missing / intake_stage on UPDATE and refuses
  -- a compliance-approved row with gaps. On 23 Oct no row is approved and the
  -- recompute changes nothing; if that is no longer true, stop and look.
  if exists (select 1 from wi_mandates where compliance_status = 'approved') then
    raise exception 'A mandate is now compliance-approved; check mandate_guard before running.';
  end if;
end $$;

-- 1. Snapshot every row that will change, whole, with the proposal beside it.
create table public.wi_mandates_snap_20261023_enrich as
with
-- tech_classify: one row per wi_mandates id with proposed is_tech_investor + tech_signal.
-- All matching is on lower()'d text, so casing ("Hedge Funds" / "hedge funds") never matters.
tf as (
  select m.id, m.investor_name,
    -- the console's isNotMandate(): stored reason or WI's category says it is news/a launch, not an allocator
    (coalesce(m.hard_fail_reasons::text,'') ~* 'not an investor mandate'
      or coalesce(m.investor_tag,'') ~* 'launch|new manager|market trend|service provider|people move|performance|fundrais|regulat|top story|top insight|managers insight') as not_mandate,
    k.fld, k.raw
  from wi_mandates m cross join lateral (values
    ('intention_summary', lower(coalesce(m.intention_summary,''))),
    ('appetite_raw',      lower(coalesce(m.appetite_raw,''))),
    ('requirements_raw',  lower(coalesce(m.requirements_raw,''))),
    ('strategies',    lower(replace(coalesce((select string_agg(x,' | ') from jsonb_array_elements_text(case when jsonb_typeof(m.strategies)='array' then m.strategies else '[]' end) x),''),'_',' '))),
    ('asset_classes', lower(replace(coalesce((select string_agg(x,' | ') from jsonb_array_elements_text(case when jsonb_typeof(m.asset_classes)='array' then m.asset_classes else '[]' end) x),''),'_',' ')))
  ) k(fld, raw)
),
ta as (   -- stated asset classes / strategies as lowercase lists, per row
  select m.id,
    (select array_agg(lower(trim(x))) from jsonb_array_elements_text(case when jsonb_typeof(m.asset_classes)='array' then m.asset_classes else '[]' end) x) as assets,
    (select array_agg(lower(replace(trim(x),'_',' '))) from jsonb_array_elements_text(case when jsonb_typeof(m.strategies)='array' then m.strategies else '[]' end) x) as strats
  from wi_mandates m
),
tc as (   -- the console's isTech() cleaning: drop refusal clauses, plan/firm names, bare "technologies"
  select tf.*,
    regexp_replace(regexp_replace(regexp_replace(raw,
      '\m(avoid[a-z]*|exclud[a-z]*|low on|away from|otherwise be)\M[^.;]*', ' ', 'g'),
      '\m(information )?technology industry\M|\m[a-z]+ tech (foundation|university)\M', ' ', 'g'),
      '\m(emerging|innovative|new|disruptive|digital|climate|clean|financial|advanced) technologies\M', ' technology ', 'g') as clean,
    substring(raw from '((avoid[a-z]*|exclud[a-z]*|low on|away from)[^.;]*(tech|technology|software|semiconductors?|tmt|internet|saas|fintech)[^.;]*)') as refusal
  from tf
),
th as (
  select tc.*,
    substring(clean from '([^.]*\m(tech|technology|tech-focused|technology-focused|software|saas|semiconductors?|tmt|internet|fintech|deep ?tech|it services|information technology|artificial intelligence|machine learning|cyber ?security)\M[^.]*)') as sent,
    substring(clean from '\m(tech|technology|tech-focused|technology-focused|software|saas|semiconductors?|tmt|internet|fintech|deep ?tech|it services|information technology|artificial intelligence|machine learning|cyber ?security)\M') as term
  from tc
),
tr as (
  select id, bool_or(not_mandate) as not_mandate,
    -- a hit inside WI's "primary investment themes include A, B, C, …" list is a theme, not a focus
    (array_agg(fld||': '||trim(sent) order by array_position(array['intention_summary','appetite_raw','requirements_raw','strategies','asset_classes'], fld))
       filter (where term is not null and not (sent ~ 'theme' and length(sent) - length(replace(sent, ',', '')) >= 2)))[1] as pos_focus,
    (array_agg(fld||': '||trim(sent)) filter (where term is not null and sent ~ 'theme' and length(sent) - length(replace(sent, ',', '')) >= 2))[1] as pos_theme,
    (array_agg(fld||': '||trim(refusal)) filter (where refusal is not null))[1] as refusal
  from th group by id
),
tech as (
  select tr.id,
    case
      when not_mandate then 'skip_not_mandate'
      when refusal is not null and refusal ~ '\m(instead|but|while|however)\M' then 'skip_mixed'
      when refusal is not null and pos_focus is not null then 'skip_mixed'
      when pos_focus is not null then 'true_focus'
      when refusal is not null then 'false_refusal'
      when pos_theme is not null then 'skip_theme_list'
      when (coalesce(array_length(assets,1),0) > 0 and not exists (select 1 from unnest(assets) a where a !~ '^(real estate|real assets|infrastructure|private debt|private credit|credit|fixed income|bonds?|direct lending|commodit(y|ies)|natural resources|agriculture|farmland|timber(land)?|cash|money markets?)$'))
        or (coalesce(array_length(assets,1),0) = 0 and coalesce(array_length(strats,1),0) > 0 and not exists (select 1 from unnest(strats) s where s !~ '(real estate|infrastructure|credit|direct lending|distressed|mezzanine|biotech|life sciences|healthcare|health care|fixed income|bonds?|municipal|commodit|timber|farmland|agricult)'))
        then 'false_nontech_focus'
      else 'no_signal' end as bucket,
    left(case
      when pos_focus is not null and not not_mandate then pos_focus
      when refusal is not null then 'refuses tech - '||refusal
      when pos_theme is not null then 'theme list - '||pos_theme
      else 'non-tech focus - '||coalesce(array_to_string(coalesce(assets, strats), ', '),'') end, 300) as signal
  from tr join ta using (id)
),
-- em_classify: one row per wi_mandates id whose open_to_emerging_markets is NULL today,
-- with a proposed value and the sentence that justifies it. Case-insensitive throughout.
ef as (
  select m.id, m.investor_country, lower(coalesce(m.investor_name,'')) as nm,
    (coalesce(m.hard_fail_reasons::text,'') ~* 'not an investor mandate'
      or coalesce(m.investor_tag,'') ~* 'launch|new manager|market trend|service provider|people move|performance|fundrais|regulat|top story|top insight|managers insight') as not_mandate,
    k.fld, k.raw
  from wi_mandates m cross join lateral (values
    ('intention_summary', lower(coalesce(m.intention_summary,''))),
    ('appetite_raw',      lower(coalesce(m.appetite_raw,''))),
    ('requirements_raw',  lower(coalesce(m.requirements_raw,''))),
    ('strategies',    lower(replace(coalesce((select string_agg(x,' | ') from jsonb_array_elements_text(case when jsonb_typeof(m.strategies)='array' then m.strategies else '[]' end) x),''),'_',' '))),
    ('asset_classes', lower(replace(coalesce((select string_agg(x,' | ') from jsonb_array_elements_text(case when jsonb_typeof(m.asset_classes)='array' then m.asset_classes else '[]' end) x),''),'_',' ')))
  ) k(fld, raw)
  where m.open_to_emerging_markets is null            -- never overwrite a value already set
),
es as (   -- split into sentences so each piece of evidence is one readable sentence
  -- the investor's own name is removed first, so "LATAM ConsultUs" is not read as a LatAm focus
  select ef.id, ef.investor_country, ef.not_mandate, ef.fld, trim(s) as sent
  from ef cross join lateral regexp_split_to_table(case when length(ef.nm) >= 4 then replace(ef.raw, ef.nm, ' ') else ef.raw end, '(?<=[.;])\s+|\s\|\s') s
  where trim(s) <> ''
    -- a person's past ("during his tenure … introduced EM debt") or a news event ("the Middle East war")
    -- is not this investor's appetite
    and trim(s) !~ '\m(during (his|her|their) tenure|previously|formerly|war|conflict|crisis|sanctions)\M'
),
em as (
  select es.*,
    -- a refusal of EM: excluded / avoided / not / no / developed-only
    (sent ~ '\m(exclud[a-z]*|avoid[a-z]*|no|not|without|away from|outside)\M[^.;]{0,50}\m(emerging|frontier)[- ]markets?\M'
      or sent ~ '\mdeveloped markets? only\M|\monly (in )?developed markets?\M'
      or sent ~ '\m(does not|do not|doesn.t|will not|no|not|exclud[a-z]*|avoid[a-z]*|outside)\M[^.;]{0,40}\m(latin america|latam|south america|africa|sub-saharan|southeast asia|asean|mena|middle east|gcc|india|brazil|mexico|china|eastern europe|turkey)\M') as neg,
    -- explicit EM wording
    (sent ~ '\m(emerging|frontier)[- ]markets?\M|\mem (equit(y|ies)|debt|credit|bonds?|fixed income|local currency|hard currency|sovereign)\M') as pos_explicit,
    -- an EM region or country, but only in a sentence about where money goes, not where the investor sits
    (sent ~ '\m(latin america|latam|south america|africa|sub-saharan|southeast asia|south-east asia|asean|mena|middle east|gcc|india|indian|brazil|brazilian|mexico|mexican|china|chinese|indonesia|vietnam|eastern europe|central and eastern europe|cee|turkey|turkish)\M'
      and sent ~ '\m(invest[a-z]*|allocat[a-z]*|exposure|focus[a-z]*|commit[a-z]*|managers?|funds?|strateg[a-z]*|opportunit[a-z]*|equit(y|ies)|debt|credit|markets?)\M'
      and sent !~ '\m(based in|headquartered|located in|founded in|established in|domiciled)\M') as pos_region
  from es
),
er as (
  select id, bool_or(not_mandate) not_mandate, max(investor_country) investor_country,
    (array_agg(fld||': '||sent) filter (where neg))[1] as neg_ev,
    (array_agg(fld||': '||sent order by array_position(array['intention_summary','appetite_raw','requirements_raw','strategies','asset_classes'], fld)) filter (where (pos_explicit or pos_region) and not neg))[1] as pos_ev,
    bool_or(pos_explicit and not neg) as any_explicit
  from em group by id
),
emc as (
  select id,
    case when not_mandate then 'skip_not_mandate'
         when neg_ev is not null and pos_ev is not null then 'skip_mixed'
         when neg_ev is not null then 'false_refusal'
         when pos_ev is not null and any_explicit then 'true_explicit'
         when pos_ev is not null then 'true_region'
         when upper(left(coalesce(investor_country,''),2)) in ('BR','MX','AR','CL','CO','PE','IN','CN','ID','VN','TH','MY','PH','ZA','NG','KE','EG','MA','TR','SA','AE','QA','KW','BH','OM','PL','CZ','HU','RO') then 'skip_domicile_only'
         else 'no_signal' end as bucket,
    left(coalesce(neg_ev, pos_ev, 'domicile '||investor_country), 300) as evidence
  from er
)
select m.*,
       t.bucket                as tech_bucket,
       case when t.bucket like 'true%' then true when t.bucket like 'false%' then false end             as tech_proposed,
       t.signal                as tech_proposed_signal,
       e.bucket                as em_bucket,
       case when e.bucket like 'true%' then true when e.bucket like 'false%' then false end               as em_proposed,
       e.evidence              as em_evidence,
       now()                   as snapped_at
  from wi_mandates m
  left join tech t on t.id = m.id
  left join emc  e on e.id = m.id
 where t.bucket in ('true_focus', 'false_refusal', 'false_nontech_focus')
    or e.bucket in ('true_explicit', 'true_region', 'false_refusal');

alter table public.wi_mandates_snap_20261023_enrich add primary key (id);

-- 2a. Tech flag. Writes only where it is still NULL.
update public.wi_mandates m
   set is_tech_investor = s.tech_proposed,
       tech_signal      = s.tech_proposed_signal,
       field_sources    = coalesce(m.field_sources, '{}'::jsonb) || jsonb_build_object(
         'is_tech_investor', jsonb_build_object(
           'at', now(), 'by', 'enrich backfill, 23 Oct 2026', 'via', 'sql',
           'was', null, 'evidence', s.tech_proposed_signal))
  from public.wi_mandates_snap_20261023_enrich s
 where m.id = s.id
   and s.tech_proposed is not null
   and m.is_tech_investor is null;

-- 2b. Emerging markets. Writes only where it is still NULL.
update public.wi_mandates m
   set open_to_emerging_markets = s.em_proposed,
       field_sources = coalesce(m.field_sources, '{}'::jsonb) || jsonb_build_object(
         'open_to_emerging_markets', jsonb_build_object(
           'at', now(), 'by', 'enrich backfill, 23 Oct 2026', 'via', 'sql',
           'was', null, 'evidence', s.em_evidence))
  from public.wi_mandates_snap_20261023_enrich s
 where m.id = s.id
   and s.em_proposed is not null
   and m.open_to_emerging_markets is null;

-- 3. Check before committing: every changed row is in the snapshot, and the
--    counts match the dry-run (tech 76 true / 235 false; EM 10 true / 1 false).
select 'tech' as what, is_tech_investor::text as value, count(*) from wi_mandates
 where is_tech_investor is not null group by 2
union all
select 'em written', open_to_emerging_markets::text, count(*) from wi_mandates m
 where field_sources ? 'open_to_emerging_markets'
   and field_sources -> 'open_to_emerging_markets' ->> 'by' = 'enrich backfill, 23 Oct 2026' group by 2
union all
select 'outside snapshot (must be 0)', null, count(*) from wi_mandates m
 where (m.is_tech_investor is not null
        or m.field_sources -> 'open_to_emerging_markets' ->> 'by' = 'enrich backfill, 23 Oct 2026')
   and not exists (select 1 from wi_mandates_snap_20261023_enrich s where s.id = m.id);

-- If the numbers are right:  commit;   otherwise:  rollback;

-- =====================================================================
-- ROLLBACK after commit — undoes exactly what this script wrote, and only
-- where the value is still the one it wrote (a later hand edit is kept).
--
-- begin;
-- update public.wi_mandates m
--    set is_tech_investor = null, tech_signal = null,
--        field_sources = m.field_sources - 'is_tech_investor'
--   from public.wi_mandates_snap_20261023_enrich s
--  where m.id = s.id and s.tech_proposed is not null
--    and m.is_tech_investor is not distinct from s.tech_proposed
--    and m.tech_signal is not distinct from s.tech_proposed_signal;
-- update public.wi_mandates m
--    set open_to_emerging_markets = s.open_to_emerging_markets,   -- NULL in the snapshot
--        field_sources = m.field_sources - 'open_to_emerging_markets'
--   from public.wi_mandates_snap_20261023_enrich s
--  where m.id = s.id and s.em_proposed is not null
--    and m.open_to_emerging_markets is not distinct from s.em_proposed
--    and m.field_sources -> 'open_to_emerging_markets' ->> 'by' = 'enrich backfill, 23 Oct 2026';
-- commit;
-- =====================================================================
