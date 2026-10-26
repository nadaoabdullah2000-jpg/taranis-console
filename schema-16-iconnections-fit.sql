-- Schema 16: Taranis criteria fit in the iConnections results.
--
-- Display only. Adds the fit of the opportunity a firm matched to what the
-- matcher returns, so the results can show it. Matching itself (keys,
-- scores, thresholds, buckets, the opportunity chosen) is unchanged: the
-- three functions below are schema-15's, with two output fields added.
--
--   fit         coalesce(new_fit_score, fit_score) - the re-score where one
--               was set, the intake score otherwise, as the console reads
--               it everywhere else (sortFit in app.js). 0..1.
--   fit_reason  wi_mandates.fit_reason: the AI's note written at intake.
--               It is never re-checked against the verdict, so the console
--               shows it labelled as that, not as the reason for the verdict.
--
-- Both come from the same row the Opportunity column shows (the one most
-- in play behind the match, newest first), so each result row is
-- consistent. Needs-review candidates carry their own fit.
--
-- iconn_match_rows gains output columns, which CREATE OR REPLACE cannot
-- do, so it is dropped and created again in the same transaction. Nothing
-- depends on it but console_iconnections_match, which calls it by name.
-- Runs staged before this keep a NULL fit until matched again. Safe to run
-- twice. Mirrored in schema.sql, section 7. Needs schema-15.

-- ---------------------------------------------------------------------
-- 1. STAGED FIT
-- ---------------------------------------------------------------------
alter table public.iconnections_import_rows
  add column if not exists matched_fit        numeric,   -- coalesce(new_fit_score, fit_score) of matched_id
  add column if not exists matched_fit_reason text;      -- wi_mandates.fit_reason of matched_id (AI note at intake)

-- ---------------------------------------------------------------------
-- 2. MATCHING, WITH THE FIT ADDED
-- ---------------------------------------------------------------------
drop function if exists public.iconn_match_rows(jsonb);

create or replace function public.iconn_match_rows(p_rows jsonb)
returns table (
  row_no int, norm_name text, bucket text, match_method text, confidence numeric,
  matched_id bigint, matched_name text, opp_ids bigint[], candidates jsonb,
  conflicts jsonb, domain_check text, matched_status text, opp_rejected int,
  matched_fit numeric, matched_fit_reason text)
language plpgsql volatile
set search_path = public
-- The query below is large enough to trip JIT compilation, which costs more
-- than it saves on a few hundred rows (about 1.2 s a call when on).
set jit = off
as $$
#variable_conflict use_column
declare
  t_auto   constant numeric := (iconn_thresholds() ->> 'auto')::numeric;
  t_review constant numeric := (iconn_thresholds() ->> 'review')::numeric;
  t_close  constant numeric := (iconn_thresholds() ->> 'too_close')::numeric;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'iConnections rows must be a JSON array' using errcode = '22023';
  end if;
  -- The % filters below use the trigram threshold. It is set here with
  -- pg_trgm's own set_limit(): a function-level SET of the
  -- pg_trgm.similarity_threshold parameter needs a privilege the Supabase
  -- roles do not have (42501). 0.3 is pg_trgm's default, so leaving it set
  -- for the rest of the session changes nothing for anyone else. t_review
  -- must stay >= it, or the index would hide candidates that score between
  -- the two.
  perform set_limit(0.3);

  drop table if exists pg_temp.iconn_opp;
  create temp table iconn_opp on commit drop as
    select m.id,
           coalesce(nullif(btrim(m.investor_name), ''), btrim(m.organization_name)) as label,
           m.investor_type,
           -- The verdict as the Rejected tab reads it: new_qualification where
           -- the re-score or a person set one, the old qualification otherwise.
           lower(coalesce(nullif(btrim(m.new_qualification), ''), nullif(btrim(m.qualification), ''), 'uncertain')) as verdict,
           -- Taranis criteria fit as the console reads it everywhere else
           -- (sortFit in app.js): the re-score, else the intake score.
           coalesce(m.new_fit_score, m.fit_score) as fit,
           nullif(btrim(m.fit_reason), '') as fit_reason,
           nullif(upper(btrim(m.investor_country)), '') as country,
           m.aum_usd, m.aum_band,
           coalesce(nullif(btrim(m.aum_band), ''), m.aum_usd::text) as aum_text,
           m.alert_date,
           nullif(iconn_norm_name(m.investor_name), '')     as n_inv,
           nullif(iconn_norm_name(m.organization_name), '') as n_org,
           iconn_acronym(m.investor_name)     as a_inv,
           iconn_acronym(m.organization_name) as a_org
      from wi_mandates m
     where coalesce(m.validation_status, '') <> 'pending';
  create index on iconn_opp (id);
  analyze iconn_opp;

  drop table if exists pg_temp.iconn_okey;
  create temp table iconn_okey on commit drop as
    with al as materialized (select iconn_norm_name(a.alias) as an, iconn_norm_name(a.full_name) as fn from investor_aliases a)
    select distinct k.id, k.key, k.kind from (
      select o.id, o.n_inv as key, 'name' as kind from iconn_opp o
      union all select o.id, o.n_org, 'name' from iconn_opp o
      union all select o.id, al.fn, 'alias' from iconn_opp o join al on al.an in (o.n_inv, o.n_org)
      union all select o.id, o.a_inv, 'acronym' from iconn_opp o
      union all select o.id, o.a_org, 'acronym' from iconn_opp o
    ) k
    where coalesce(k.key, '') <> '';

  drop table if exists pg_temp.iconn_fkey;
  create temp table iconn_fkey on commit drop as
    select k.key, iconn_core_name(k.key) as core, iconn_digits(k.key) as dg, array_agg(k.id order by k.id) as ids
      from iconn_okey k where k.kind = 'name' group by k.key;
  create index on iconn_fkey using gin (key gin_trgm_ops);
  create index on iconn_fkey using gin (core gin_trgm_ops);
  analyze iconn_fkey;

  return query
  with
  inp as materialized (
    select x.row_no, btrim(x.name) as name,
           iconn_norm_name(x.name) as n,
           iconn_core_name(iconn_norm_name(x.name)) as core,
           iconn_digits(iconn_norm_name(x.name)) as dg,
           iconn_acronym(x.name) as acr,
           nullif(lower(btrim(x.domain)), '') as domain,
           x.aum_low, x.aum_high, x.investor_type,
           nullif(upper(btrim(x.country)), '') as country
      from jsonb_to_recordset(p_rows) as x(row_no int, name text, domain text, aum_low numeric,
                                           aum_high numeric, investor_type text, country text)
     where btrim(coalesce(x.name, '')) <> ''
  ),
  al as materialized (select iconn_norm_name(a.alias) as an, iconn_norm_name(a.full_name) as fn from investor_aliases a),
  rkey as (
    select i.row_no, i.n as key, 'name' as kind from inp i where i.n <> ''
    union select i.row_no, al.fn, 'alias' from inp i join al on al.an = i.n or al.an = i.acr
    union select i.row_no, i.acr, 'acronym' from inp i where i.acr is not null
  ),
  hit as (
    -- A name on either side, or an alias on both. Two acronyms alone, or an
    -- acronym against an alias, are too loose to call.
    select r.row_no, o.id,
           case when r.kind = 'name' and o.kind = 'name' then 'exact' else 'alias' end as method,
           (r.kind = 'acronym' or o.kind = 'acronym') as via_acr
      from rkey r join iconn_okey o on o.key = r.key
     where r.kind = 'name' or o.kind = 'name' or (r.kind = 'alias' and o.kind = 'alias')
  ),
  hitset as (
    select h.row_no,
           min(h.method) as method,                         -- one method per row after the rank filter
           array_agg(distinct h.id) as ids,
           bool_and(h.via_acr) as only_acr
      from hit h
     where (case h.method when 'exact' then 1 else 2 end)
           = (select min(case h2.method when 'exact' then 1 else 2 end) from hit h2 where h2.row_no = h.row_no)
     group by h.row_no
  ),
  fz as (
    select i.row_no, c.key, c.ids, c.score,
           row_number() over (partition by i.row_no order by c.score desc, c.key) as rn
      from inp i
      cross join lateral (
        select f.key, f.ids,
               round((case
                 when f.dg <> i.dg then least(t.sim, 0.6)
                 when length(i.n) >= 5 and f.key like i.n || ' %' then greatest(t.sim, 0.72)
                 else t.sim end)::numeric, 3) as score
          -- Candidates: close on the full name or on the core (both through
          -- the trigram indexes), or the file's name opening a longer one
          -- ("stifel" -> "stifel nicolaus"). Not the other way round: a
          -- stored "yale" (Yale University, normalised) must not pull in
          -- "Yale New Haven Health". Normalised
          -- names hold only letters, digits and spaces, so these LIKEs have
          -- no wildcards but their own.
          from (select f1.* from iconn_fkey f1 where f1.key % i.n
                union
                select f2.* from iconn_fkey f2 where i.core <> '' and f2.core % i.core
                union
                select f3.* from iconn_fkey f3
                 where length(i.n) >= 5 and f3.key like i.n || ' %') f
          cross join lateral (
            select case when i.core <> '' and f.core <> ''
                        then (similarity(i.n, f.key) + similarity(i.core, f.core)) / 2
                        else least(similarity(i.n, f.key), 0.6) end as sim) t
         order by 3 desc, 1
         limit 3) c
     where i.n <> ''
       and not exists (select 1 from hitset h where h.row_no = i.row_no)
       and c.score >= t_review
  ),
  dom as materialized (
    select lower(split_part(c.email, '@', 2)) as d, iconn_norm_name(c.company) as cn
      from contacts c
     where c.email like '%@%' and btrim(coalesce(c.company, '')) <> ''
       and lower(split_part(c.email, '@', 2)) not in
           ('gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
            'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me', 'msn.com')
  ),
  base as (
    select i.*,
           coalesce(h.method, case when f1.row_no is not null then 'fuzzy' end) as method,
           coalesce(h.ids, f1.ids) as ids,
           h.only_acr,
           case when h.method = 'exact' then 1.0
                when h.method = 'alias' and h.only_acr then 0.90
                when h.method = 'alias' then 0.95
                else f1.score end as score,
           (f1.row_no is not null and f2.row_no is not null and f1.score - f2.score < t_close) as too_close,
           (select count(distinct coalesce(o.n_inv, o.n_org)) from iconn_opp o where o.id = any(h.ids)) as groups
      from inp i
      left join hitset h on h.row_no = i.row_no
      left join fz f1 on f1.row_no = i.row_no and f1.rn = 1
      left join fz f2 on f2.row_no = i.row_no and f2.rn = 2
  ),
  domd as (
    select b.*,
           case when b.domain is null or b.ids is null then null
                when not exists (select 1 from dom where dom.d = b.domain or dom.d like '%.' || b.domain) then null
                when exists (select 1 from dom, iconn_opp o
                              where (dom.d = b.domain or dom.d like '%.' || b.domain) and o.id = any(b.ids)
                                and (dom.cn in (o.n_inv, o.n_org)
                                     or similarity(dom.cn, coalesce(o.n_inv, '')) >= 0.5
                                     or similarity(dom.cn, coalesce(o.n_org, '')) >= 0.5)) then 'confirms'
                else 'differs' end as domain_check
      from base b
  ),
  scored as (
    select d.*,
           least(1.0, greatest(0.0, d.score
             + case when d.method = 'fuzzy' and d.domain_check = 'confirms' then 0.05
                    when d.method = 'fuzzy' and d.domain_check = 'differs'  then -0.10
                    else 0 end)) as conf
      from domd d
  ),
  bucketed as (
    select s.*,
           case when s.method in ('exact', 'alias') and s.only_acr and s.groups > 1 then 'review'
                when s.method in ('exact', 'alias') then 'matched'
                when s.method = 'fuzzy' and s.conf >= t_auto and not s.too_close then 'matched'
                when s.method = 'fuzzy' and s.conf >= t_review then 'review'
                else 'none' end as bucket
      from scored s
  )
  select b.row_no,
         b.n,
         b.bucket,
         case when b.bucket = 'none' then null else b.method end,
         case when b.bucket = 'none' then null else round(b.conf, 3) end,
         rep.id,
         rep.label,
         case when b.bucket = 'matched' then b.ids end,
         cand.list,
         conf.list,
         b.domain_check,
         rep.verdict,
         (select count(*)::int from iconn_opp o where b.bucket = 'matched' and o.id = any(b.ids) and o.verdict = 'rejected'),
         -- The fit of the same row the Opportunity column shows.
         rep.fit,
         rep.fit_reason
    from bucketed b
    -- The opportunity shown for a match: the one still most in play behind
    -- it (matched, then review, low fit, needs data, rejected), newest first.
    -- So a firm shows as rejected only when every row behind it is.
    left join lateral (
      select o.id, o.label, o.verdict, o.fit, o.fit_reason from iconn_opp o
       where b.bucket = 'matched' and o.id = any(b.ids)
       order by case o.verdict when 'matched' then 5 when 'uncertain' then 4 when 'low' then 3
                               when 'needs_data' then 2 when 'rejected' then 1 else 0 end desc,
                o.alert_date desc nulls last, o.id desc
       limit 1) rep on true
    -- What a reviewer chooses between: the fuzzy runners-up, or the
    -- investors an ambiguous acronym points at. One entry per investor,
    -- each represented by its newest row, with that row's fit.
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.label, 'score', c.score, 'rows', c.rows, 'status', c.verdict,
                                          'fit', c.fit, 'fit_reason', c.fit_reason)
                       order by c.score desc, c.label) as list
        from (
          select distinct on (g.key) g.key, g.score, o.id, o.label, o.verdict, o.fit, o.fit_reason, cardinality(g.ids) as rows
            from (select f.key, f.score, f.ids from fz f where f.row_no = b.row_no
                  union all
                  select coalesce(o2.n_inv, o2.n_org), b.score, array_agg(o2.id)
                    from iconn_opp o2
                   where b.method in ('exact', 'alias') and o2.id = any(b.ids)
                   group by coalesce(o2.n_inv, o2.n_org)) g
            join iconn_opp o on o.id = any(g.ids)
           order by g.key, o.alert_date desc nulls last, o.id desc
        ) c
       where b.bucket = 'review' or (b.bucket = 'matched' and b.method = 'fuzzy')) cand on true
    -- Where the file and the matched opportunity disagree. Opportunities
    -- often hold several rows for one investor; it is a conflict only when
    -- none of them agrees.
    left join lateral (
      select nullif(jsonb_agg(x.c), '[]'::jsonb) as list from (
        select jsonb_build_object('field', 'type', 'file', b.investor_type,
                                  'opportunity', string_agg(distinct o.investor_type, ' / ')) as c
          from iconn_opp o where b.bucket = 'matched' and o.id = any(b.ids) and iconn_type_group(o.investor_type) is not null
        having iconn_type_group(b.investor_type) is not null
           and not bool_or(iconn_type_group(o.investor_type) = iconn_type_group(b.investor_type))
        union all
        select jsonb_build_object('field', 'country', 'file', b.country,
                                  'opportunity', string_agg(distinct o.country, ' / '))
          from iconn_opp o where b.bucket = 'matched' and o.id = any(b.ids) and o.country is not null
        having b.country is not null and not bool_or(o.country = b.country)
        union all
        select jsonb_build_object('field', 'aum', 'file_low', b.aum_low, 'file_high', b.aum_high,
                                  'opportunity', string_agg(distinct o.aum_text, ' / '))
          from iconn_opp o
          cross join lateral (select coalesce(case when o.aum_usd > 0 then array[o.aum_usd, o.aum_usd] end,
                                              iconn_aum_bounds(o.aum_band)) as aum) a
         where b.bucket = 'matched' and o.id = any(b.ids) and a.aum is not null
        having (b.aum_low is not null or b.aum_high is not null)
           -- Compatible when the two ranges overlap after allowing a factor
           -- of two either way. An open upper bound is infinite.
           and not bool_or(coalesce(b.aum_low, 0) <= coalesce(a.aum[2] * 2, 'infinity'::numeric)
                       and coalesce(a.aum[1], 0) <= coalesce(b.aum_high * 2, 'infinity'::numeric))
        union all
        select jsonb_build_object('field', 'domain', 'file', b.domain,
                                  'opportunity', 'contacts at ' || b.domain || ' work for another firm')
         where b.bucket = 'matched' and b.domain_check = 'differs'
      ) x) conf on true;
end
$$;


create or replace function public.console_iconnections_match(
  p_file_sha256 text, p_file_name text, p_sheet text, p_columns jsonb, p_first boolean, p_rows jsonb)
returns jsonb
language plpgsql volatile
set search_path = public
as $$
declare
  v_run    bigint;
  v_import int;
  v_n      int;
begin
  if coalesce(p_file_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'The file fingerprint must be 64 hex characters (SHA-256).' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be a JSON array.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_rows);
  if v_n > 1000 then
    raise exception 'Send at most 1,000 rows per call (this one had %).', v_n using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as x(row_no int, name text)
              where x.row_no is null or x.row_no < 1 or btrim(coalesce(x.name, '')) = '') then
    raise exception 'Every row needs a row number and an allocator name.' using errcode = '22023';
  end if;
  if (select count(distinct x.row_no) from jsonb_to_recordset(p_rows) as x(row_no int)) <> v_n then
    raise exception 'A row number appears twice in this chunk.' using errcode = '22023';
  end if;

  insert into iconnections_import_runs as r (file_sha256, file_name, sheet_name, columns, thresholds)
  values (p_file_sha256, left(p_file_name, 300), left(p_sheet, 100), coalesce(p_columns, '{}'::jsonb), iconn_thresholds())
  on conflict (file_sha256) do update
     set file_name       = excluded.file_name,
         sheet_name      = excluded.sheet_name,
         columns         = excluded.columns,
         thresholds      = excluded.thresholds,
         import_no       = r.import_no + case when p_first then 1 else 0 end,
         last_matched_at = now(),
         matched_by      = auth.jwt() ->> 'email'
  returning r.id, r.import_no into v_run, v_import;

  insert into iconnections_import_rows as t
         (run_id, row_no, import_no, contacts, row_nos, raw, name, domain, aum_text, aum_low, aum_high, investor_type, country,
          norm_name, bucket, match_method, confidence, matched_id, matched_name, matched_status, opp_ids, opp_rejected,
          matched_fit, matched_fit_reason, candidates, conflicts, domain_check, matched_at)
  select v_run, x.row_no, v_import, greatest(coalesce(x.contacts, 1), 1), coalesce(x.row_nos, array[x.row_no]),
         coalesce(x.raw, '{}'::jsonb), btrim(x.name),
         nullif(lower(btrim(x.domain)), ''), left(x.aum_text, 200), x.aum_low, x.aum_high,
         left(x.investor_type, 200), nullif(upper(btrim(x.country)), ''),
         m.norm_name, m.bucket, m.match_method, m.confidence, m.matched_id, m.matched_name, m.matched_status,
         m.opp_ids, m.opp_rejected, m.matched_fit, m.matched_fit_reason, m.candidates, m.conflicts, m.domain_check, now()
    from jsonb_to_recordset(p_rows) as x(row_no int, contacts int, row_nos int[], raw jsonb, name text, domain text,
                                         aum_text text, aum_low numeric, aum_high numeric, investor_type text, country text)
    join iconn_match_rows(p_rows) m on m.row_no = x.row_no
  on conflict (run_id, row_no) do update
     set import_no = excluded.import_no, contacts = excluded.contacts, row_nos = excluded.row_nos,
         raw = excluded.raw, name = excluded.name, domain = excluded.domain,
         aum_text = excluded.aum_text, aum_low = excluded.aum_low, aum_high = excluded.aum_high,
         investor_type = excluded.investor_type, country = excluded.country, norm_name = excluded.norm_name,
         bucket = excluded.bucket, match_method = excluded.match_method, confidence = excluded.confidence,
         matched_id = excluded.matched_id, matched_name = excluded.matched_name,
         matched_status = excluded.matched_status, opp_ids = excluded.opp_ids, opp_rejected = excluded.opp_rejected,
         matched_fit = excluded.matched_fit, matched_fit_reason = excluded.matched_fit_reason,
         candidates = excluded.candidates, conflicts = excluded.conflicts,
         domain_check = excluded.domain_check, matched_at = excluded.matched_at;

  update iconnections_import_runs r
     set row_count = (select count(*) from iconnections_import_rows t where t.run_id = r.id and t.import_no = r.import_no)
   where r.id = v_run;

  return jsonb_build_object('run_id', v_run, 'import_no', v_import, 'rows', v_n);
end
$$;


create or replace function public.console_iconnections_run(p_run_id bigint)
returns jsonb
language sql stable
set search_path = public
as $$
  with run as (
    select * from iconnections_import_runs where id = p_run_id
  ),
  t as (
    select r.*, coalesce(nullif(r.norm_name, ''), lower(r.name)) as firm_key
      from iconnections_import_rows r join run on run.id = r.run_id and r.import_no = run.import_no
  ),
  firm as (
    select t.firm_key,
           (array_agg(t.name order by t.contacts desc, t.row_no))[1] as name,
           array_agg(distinct t.name) as spellings,
           sum(t.contacts)::int as contacts,
           (select array_agg(x order by x)
              from (select distinct unnest(coalesce(t2.row_nos, array[t2.row_no])) as x
                      from t t2 where t2.firm_key = t.firm_key) z) as row_nos,
           (array_agg(to_jsonb(t) order by t.row_no))[1] as lead,
           (select jsonb_agg(distinct c)
              from t t3 cross join lateral jsonb_array_elements(coalesce(t3.conflicts, '[]'::jsonb)) c
             where t3.firm_key = t.firm_key) as conflicts
      from t
     group by t.firm_key
  ),
  f as (
    select firm.name, firm.spellings, firm.contacts, firm.row_nos, firm.conflicts,
           lead ->> 'bucket' as bucket, lead ->> 'match_method' as match_method,
           (lead ->> 'confidence')::numeric as confidence,
           (lead ->> 'matched_id')::bigint as matched_id, lead ->> 'matched_name' as matched_name,
           lead ->> 'matched_status' as matched_status, nullif(lead -> 'opp_ids', 'null'::jsonb) as opp_ids,
           (lead ->> 'matched_fit')::numeric as matched_fit, lead ->> 'matched_fit_reason' as matched_fit_reason,
           coalesce((lead ->> 'opp_rejected')::int, 0) as opp_rejected,
           nullif(lead -> 'candidates', 'null'::jsonb) as candidates, lead ->> 'domain_check' as domain_check
      from firm
  ),
  r as (
    select f.*,
           f.bucket = 'matched' and f.opp_rejected > 0
             and f.opp_rejected = jsonb_array_length(coalesce(f.opp_ids, '[]'::jsonb)) as rejected,
           case when f.matched_id is not null
                then array_remove(array_agg(f.name) over (partition by f.matched_id), f.name) end as same_opportunity
      from f
  )
  select case when not exists (select 1 from run) then null else jsonb_build_object(
    'run', (select jsonb_build_object('id', id, 'file_name', file_name, 'sheet_name', sheet_name,
                                      'columns', columns, 'thresholds', thresholds, 'import_no', import_no,
                                      'row_count', row_count, 'created_at', created_at,
                                      'last_matched_at', last_matched_at) from run),
    'counts', (select jsonb_build_object(
                 'firms',      count(*),
                 'contacts',   coalesce(sum(contacts), 0),
                 'matched',    count(*) filter (where bucket = 'matched'),
                 'rejected',   count(*) filter (where rejected),
                 'review',     count(*) filter (where bucket = 'review'),
                 'none',       count(*) filter (where bucket = 'none'),
                 'duplicates', count(*) filter (where jsonb_array_length(coalesce(opp_ids, '[]'::jsonb)) > 1
                                                   or cardinality(same_opportunity) > 0),
                 'conflicts',  count(*) filter (where conflicts is not null)) from r),
    'firms', coalesce((select jsonb_agg(jsonb_build_object(
                 'name', name, 'spellings', spellings, 'contacts', contacts, 'row_nos', row_nos,
                 'bucket', bucket, 'match_method', match_method, 'confidence', confidence,
                 'matched_id', matched_id, 'matched_name', matched_name, 'matched_status', matched_status,
                 'matched_fit', matched_fit, 'matched_fit_reason', matched_fit_reason,
                 'rejected', rejected, 'opp_ids', opp_ids, 'opp_rejected', opp_rejected,
                 'same_opportunity', same_opportunity, 'candidates', candidates, 'conflicts', conflicts,
                 'domain_check', domain_check)
               order by confidence desc nulls last, name) from r), '[]'::jsonb)
  ) end
$$;


revoke all on function public.iconn_match_rows(jsonb) from public, anon;
revoke all on function public.console_iconnections_match(text, text, text, jsonb, boolean, jsonb) from public, anon;
revoke all on function public.console_iconnections_run(bigint) from public, anon;
grant execute on function public.iconn_match_rows(jsonb) to authenticated, service_role, taranis_bot;
grant execute on function public.console_iconnections_match(text, text, text, jsonb, boolean, jsonb) to authenticated, service_role, taranis_bot;
grant execute on function public.console_iconnections_run(bigint) to authenticated, service_role, taranis_bot;

-- ---------------------------------------------------------------------
-- ROLLBACK (back to schema-15's output; nothing else changes)
--   drop function if exists public.iconn_match_rows(jsonb);
--   then re-run schema-15 sections 4 and 5 (iconn_match_rows,
--   console_iconnections_match, console_iconnections_run and their grants)
--   alter table public.iconnections_import_rows drop column if exists matched_fit_reason,
--     drop column if exists matched_fit;
-- ---------------------------------------------------------------------
