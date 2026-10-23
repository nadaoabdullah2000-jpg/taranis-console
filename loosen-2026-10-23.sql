-- =====================================================================
-- loosen-2026-10-23.sql — low-precision WI coverage pass on wi_mandates.
-- Run after enrich-2026-10-23.sql. Same classifier, two groups it left NULL:
--
--   tech: is_tech_investor = true where a tech / AI / fintech term appears
--         ONLY inside WI's "primary investment themes include A, B, C…" list
--         (bucket skip_theme_list, 35 rows on 23 Oct). tech_signal starts
--         'theme-list (low precision) - '.
--   EM:   open_to_emerging_markets = true where the ONLY evidence is an
--         emerging-market investor_country (bucket skip_domicile_only),
--         minus rows whose own text states a developed-markets focus with no
--         EM openness (5 rows on 23 Oct: 23, 999, 1022, 2388, 2400) — those
--         have evidence against EM, so they are not "domicile only".
--         Evidence starts 'domicile (low precision) - '.
--
-- Only rows still NULL are written. Every touched row is copied whole into
-- wi_mandates_snap_20261023_loosen first; field_sources records
-- {at, by: 'wi loosen pass, 23 Oct 2026', via, was, evidence}. Runs as one DO block, so any
-- failed check rolls everything back, snapshot included.
-- =====================================================================

do $loosen$
declare n_snap int; n_tech int; n_em int; n_out int;
begin
  if exists (select 1 from information_schema.tables where table_schema='public'
              and table_name='wi_mandates_snap_20261023_loosen') then
    raise exception 'wi_mandates_snap_20261023_loosen already exists: this script has run before.';
  end if;
  if exists (select 1 from wi_mandates where compliance_status = 'approved'
              or compliance_approved_by is not null or compliance_approval_date is not null) then
    raise exception 'A mandate is now compliance-approved; check mandate_guard before running.';
  end if;

create table public.wi_mandates_snap_20261023_loosen as

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
       case when t.bucket = 'skip_theme_list' and m.is_tech_investor is null then true end as tech_proposed,
       case when t.bucket = 'skip_theme_list' and m.is_tech_investor is null
            then left('theme-list (low precision) - ' || regexp_replace(t.signal, '^theme list - ', ''), 300) end as tech_proposed_signal,
       case when e.bucket = 'skip_domicile_only' and m.open_to_emerging_markets is null
             and not (concat_ws(' ', m.intention_summary, m.appetite_raw, m.requirements_raw) ~* '\mdeveloped[- ]markets?\M' and concat_ws(' ', m.intention_summary, m.appetite_raw, m.requirements_raw) !~* '\memerging (markets?|economies)\M') then true end as em_proposed,
       case when e.bucket = 'skip_domicile_only' and m.open_to_emerging_markets is null
             and not (concat_ws(' ', m.intention_summary, m.appetite_raw, m.requirements_raw) ~* '\mdeveloped[- ]markets?\M' and concat_ws(' ', m.intention_summary, m.appetite_raw, m.requirements_raw) !~* '\memerging (markets?|economies)\M') then 'domicile (low precision) - ' || m.investor_country end as em_evidence,
       now() as snapped_at
  from wi_mandates m
  left join tech t on t.id = m.id
  left join emc  e on e.id = m.id
 where (t.bucket = 'skip_theme_list' and m.is_tech_investor is null)
    or (e.bucket = 'skip_domicile_only' and m.open_to_emerging_markets is null and not (concat_ws(' ', m.intention_summary, m.appetite_raw, m.requirements_raw) ~* '\mdeveloped[- ]markets?\M' and concat_ws(' ', m.intention_summary, m.appetite_raw, m.requirements_raw) !~* '\memerging (markets?|economies)\M'));

alter table public.wi_mandates_snap_20261023_loosen add primary key (id);

update public.wi_mandates m
   set is_tech_investor = true,
       tech_signal      = s.tech_proposed_signal,
       field_sources    = coalesce(m.field_sources, '{}'::jsonb) || jsonb_build_object(
         'is_tech_investor', jsonb_build_object(
           'at', now(), 'by', 'wi loosen pass, 23 Oct 2026', 'via', 'sql', 'was', null, 'evidence', s.tech_proposed_signal))
  from public.wi_mandates_snap_20261023_loosen s
 where m.id = s.id and s.tech_proposed and m.is_tech_investor is null;
get diagnostics n_tech = row_count;

update public.wi_mandates m
   set open_to_emerging_markets = true,
       field_sources = coalesce(m.field_sources, '{}'::jsonb) || jsonb_build_object(
         'open_to_emerging_markets', jsonb_build_object(
           'at', now(), 'by', 'wi loosen pass, 23 Oct 2026', 'via', 'sql', 'was', null, 'evidence', s.em_evidence))
  from public.wi_mandates_snap_20261023_loosen s
 where m.id = s.id and s.em_proposed and m.open_to_emerging_markets is null;
get diagnostics n_em = row_count;

  select count(*) into n_snap from public.wi_mandates_snap_20261023_loosen;
  if n_tech <> 35 or n_em <> 74 or n_snap <> 109 then
    raise exception 'Counts differ from the dry-run: tech %, em %, snapshot %', n_tech, n_em, n_snap;
  end if;

  select count(*) into n_out from wi_mandates m
   where (m.field_sources -> 'is_tech_investor' ->> 'by' = 'wi loosen pass, 23 Oct 2026'
          or m.field_sources -> 'open_to_emerging_markets' ->> 'by' = 'wi loosen pass, 23 Oct 2026')
     and not exists (select 1 from public.wi_mandates_snap_20261023_loosen s where s.id = m.id);
  if n_out <> 0 then
    raise exception 'Rows changed outside the snapshot: %. Rolled back.', n_out;
  end if;
end
$loosen$;

-- =====================================================================
-- ROLLBACK — undoes exactly this pass, only where the value is still its own.
-- begin;
-- update public.wi_mandates m
--    set is_tech_investor = null, tech_signal = null,
--        field_sources = m.field_sources - 'is_tech_investor'
--   from public.wi_mandates_snap_20261023_loosen s
--  where m.id = s.id and s.tech_proposed
--    and m.field_sources -> 'is_tech_investor' ->> 'by' = 'wi loosen pass, 23 Oct 2026';
-- update public.wi_mandates m
--    set open_to_emerging_markets = null,
--        field_sources = m.field_sources - 'open_to_emerging_markets'
--   from public.wi_mandates_snap_20261023_loosen s
--  where m.id = s.id and s.em_proposed
--    and m.field_sources -> 'open_to_emerging_markets' ->> 'by' = 'wi loosen pass, 23 Oct 2026';
-- commit;
-- =====================================================================
