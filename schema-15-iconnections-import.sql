-- Schema 15: match an iConnections export against Opportunities.
--
-- The console reads the .xlsx in the browser and sends only the parsed rows
-- here. This file adds what the matching needs and nothing else:
--
--   1. investor_aliases becomes usable and editable from the console
--      (it had row-level security on and no policies, so nobody could read it)
--   2. name normalisers and an AUM / investor-type reader
--   3. two staging tables, so every run can be repeated and inspected
--   4. iconn_match_rows: the matching itself, read-only
--   5. console_iconnections_match (stage + match one chunk of rows) and
--      console_iconnections_run (read a run back, with cross-row flags)
--
-- Opportunities (wi_mandates) are only read. Nothing here writes to them,
-- indexes them or changes a function that reads them. Safe to run twice.
--
-- Mirrored in schema.sql, section 6. Run this file once in the SQL editor.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- 1. ALIASES
--    One table, two readers: expand_investor() (repair scripts, run as
--    postgres) and the iConnections matching below. Console users can now
--    read, add, change and remove aliases. Every alias is stored the way
--    expand_investor() looks it up (lower case, no dots or commas), so an
--    alias added from the console is found by both.
-- ---------------------------------------------------------------------
alter table public.investor_aliases
  add column if not exists note       text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by text default (auth.jwt() ->> 'email');

comment on table public.investor_aliases is
  'Short or alternative names for an investor -> the full name. Read by expand_investor() and the iConnections matching (schema-15). Editable from the console.';

create or replace function public.investor_aliases_tidy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.alias     := lower(btrim(regexp_replace(replace(replace(coalesce(new.alias, ''), '.', ''), ',', ''), '\s+', ' ', 'g')));
  new.full_name := btrim(regexp_replace(coalesce(new.full_name, ''), '\s+', ' ', 'g'));
  if new.alias = '' or new.full_name = '' then
    raise exception 'An alias needs both the short name and the full name it stands for.' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists investor_aliases_tidy on public.investor_aliases;
create trigger investor_aliases_tidy
  before insert or update on public.investor_aliases
  for each row execute function public.investor_aliases_tidy();

-- 'masspRim' was stored mixed-case, so expand_investor() (which looks up
-- lower case) never found it. Rewriting it through the trigger fixes it.
-- Rollback: update investor_aliases set alias = 'masspRim' where alias = 'massprim';
update public.investor_aliases a
   set alias = a.alias
 where a.alias <> lower(btrim(replace(replace(a.alias, '.', ''), ',', '')))
   and not exists (select 1 from public.investor_aliases b
                    where b.alias = lower(btrim(replace(replace(a.alias, '.', ''), ',', ''))));

insert into public.investor_aliases (alias, full_name, note) values
  ('cmu',   'Carnegie Mellon University',                 'seed: schema-15'),
  ('nyu',   'New York University',                        'seed: schema-15'),
  ('mit',   'Massachusetts Institute of Technology',      'seed: schema-15'),
  ('hmc',   'Harvard Management Company',                 'seed: schema-15'),
  ('pif',   'Public Investment Fund',                     'seed: schema-15'),
  ('qia',   'Qatar Investment Authority',                 'seed: schema-15'),
  ('kia',   'Kuwait Investment Authority',                'seed: schema-15'),
  ('gpif',  'Government Pension Investment Fund',         'seed: schema-15'),
  ('otpp',  'Ontario Teachers Pension Plan',              'seed: schema-15'),
  ('cdpq',  'Caisse de depot et placement du Quebec',     'seed: schema-15')
on conflict (alias) do nothing;

alter table public.investor_aliases enable row level security;

drop policy if exists console_read    on public.investor_aliases;
drop policy if exists aliases_add     on public.investor_aliases;
drop policy if exists aliases_edit    on public.investor_aliases;
drop policy if exists aliases_remove  on public.investor_aliases;
drop policy if exists automation_full on public.investor_aliases;
create policy console_read    on public.investor_aliases for select using (is_console_user());
create policy aliases_add     on public.investor_aliases for insert with check (is_console_user());
create policy aliases_edit    on public.investor_aliases for update using (is_console_user()) with check (is_console_user());
create policy aliases_remove  on public.investor_aliases for delete using (is_console_user());
create policy automation_full on public.investor_aliases for all to taranis_bot using (true) with check (true);
revoke all on public.investor_aliases from anon;

-- ---------------------------------------------------------------------
-- 2. NORMALISERS
--    iconn_norm_name: lower case, accents folded, bracketed text dropped
--      ("Utah Retirement Systems (URS)" -> "utah retirement systems"),
--      & -> and, dots and apostrophes joined ("L.P." -> "lp"), other
--      punctuation -> space, short forms written out (mgmt, intl, hldgs,
--      grp, ptnrs, assoc, svcs, fdn, univ, fo / mfo / sfo), then legal /
--      type words removed wherever they
--      stand as a word: the, llc, lp, llp, ltd, limited, inc, incorporated,
--      corp, corporation, co, company, plc, sa, ag, gmbh, foundation,
--      endowment, pension, university. A name made only of those words
--      keeps them, so it never normalises to nothing.
--    iconn_core_name: a normalised name without the words most allocator
--      names share (capital, management, partners, family office ...).
--      Fuzzy scores average the full and the core similarity, so "KW
--      Investment Management" does not look like "SEB Investment
--      Management" just because two of three words agree.
--    iconn_acronym: the bracketed short form, if it is one word of 3-12
--      letters or digits ("(URS)" -> "urs", "(MassPRIM)" -> "massprim").
-- ---------------------------------------------------------------------
create or replace function public.iconn_norm_name(p text)
returns text
language sql immutable parallel safe
set search_path = public
as $$
  with b as (
    select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
             translate(lower(coalesce(p, '')),
                       'àáâãäåāèéêëēìíîïīòóôõöøōùúûüūçñýÿ',
                       'aaaaaaaeeeeeiiiiioooooooouuuuucnyy'),
             '\([^)]*\)', ' ', 'g'),
             '&', ' and ', 'g'),
             '[.''’`]', '', 'g'),
             '[^[:alnum:]]+', ' ', 'g')) as s
  )
  , w as (
    -- Common short forms, written out so "Cresset Capital Mgmt" is the same
    -- name as "Cresset Capital Management".
    select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(' ' || s || ' ',
             ' (?:mgmt|mgt)(?= )', ' management', 'g'),
             ' intl(?= )', ' international', 'g'),
             ' (?:hldgs|hldg)(?= )', ' holdings', 'g'),
             ' grp(?= )', ' group', 'g'),
             ' (?:ptnrs|prtnrs)(?= )', ' partners', 'g'),
             ' (?:assoc|assocs)(?= )', ' associates', 'g'),
             ' svcs(?= )', ' services', 'g'),
             ' (?:fdn|fdtn)(?= )', ' foundation', 'g'),
             ' univ(?= )', ' university', 'g'),
             ' mfo(?= )', ' multi family office', 'g'),
             ' sfo(?= )', ' single family office', 'g'),
             ' fo(?= )', ' family office', 'g') as s
      from b
  )
  select coalesce(nullif(btrim(regexp_replace(regexp_replace(w.s,
           ' (?:the|llc|lp|llp|ltd|limited|inc|incorporated|corp|corporation|co|company|plc|sa|ag|gmbh|foundation|endowment|pension|university)(?= )',
           ' ', 'g'), ' +', ' ', 'g')), ''), b.s)
    from b, w
$$;

create or replace function public.iconn_core_name(p_norm text)
returns text
language sql immutable parallel safe
set search_path = public
as $$
  select btrim(regexp_replace(regexp_replace(' ' || coalesce(p_norm, '') || ' ',
           ' (?:capital|management|managers?|assets?|investments?|investors?|partners?|advisors?|advisers|advisory|group|holdings?|funds?|family|offices?|wealth|global|international|financial|services|trust|associates|ventures|equity|private|and|of|retirement|systems?|employees|public|plan|board|fo|mfo|sfo)(?= )',
           ' ', 'g'), ' +', ' ', 'g'))
$$;

create or replace function public.iconn_acronym(p text)
returns text
language sql immutable parallel safe
set search_path = public
as $$
  select nullif(a, '')
    from (select lower(regexp_replace(coalesce(substring(p from '\(\s*([[:alnum:]][[:alnum:].&]{1,15})\s*\)'), ''),
                                      '[^[:alnum:]]', '', 'g')) as a) x
   where length(a) between 3 and 12
$$;

create or replace function public.iconn_unit(p text)
returns numeric
language sql immutable parallel safe
set search_path = public
as $$
  select case lower(coalesce(p, ''))
           when 'k' then 1e3 when 'thousand' then 1e3
           when 'm' then 1e6 when 'mm' then 1e6 when 'mn' then 1e6 when 'million' then 1e6 when 'millions' then 1e6
           when 'b' then 1e9 when 'bn' then 1e9 when 'billion' then 1e9 when 'billions' then 1e9
           when 'tn' then 1e12 when 'trillion' then 1e12
         end
$$;

-- AUM text -> {low, high} in USD; high NULL = no upper bound. Understands
-- the bands Opportunities hold ("$1bn - $2.5bn", "> $50bn", "USD 100m-500m",
-- "$20-100m", "at least $500m", "under $200m", "circa $643m", "$6.4 billion").
-- Anything else (percentages, sentences) is NULL: not understood, so it is
-- never the basis of a conflict. The console's reader (iconnections.js,
-- parseAum) follows the same rules for the uploaded file.
create or replace function public.iconn_aum_bounds(p text)
returns numeric[]
language plpgsql immutable parallel safe
set search_path = public
as $$
declare
  s    text;
  m    text[];
  num  constant text := '([0-9][0-9,]*(?:\.[0-9]+)?)';
  unit constant text := '(k|thousand|m|mm|mn|million|millions|b|bn|billion|billions|tn|trillion)';
  cur  constant text := '(?:usd|us\$|\$)?\s*\$?\s*';
  lo   numeric;
  hi   numeric;
begin
  s := regexp_replace(replace(replace(lower(btrim(coalesce(p, ''))), '–', '-'), '—', '-'), '\s+', ' ', 'g');
  if s = '' or s ~ '%' then return null; end if;

  m := regexp_match(s, '^' || cur || num || '\s*' || unit || '?\s*(?:-|to)\s*' || cur || num || '\s*' || unit || '$');
  if m is not null then
    lo := replace(m[1], ',', '')::numeric * public.iconn_unit(coalesce(m[2], m[4]));
    hi := replace(m[3], ',', '')::numeric * public.iconn_unit(m[4]);
    return array[least(lo, hi), greatest(lo, hi)];
  end if;

  m := regexp_match(s, '^(>=?|over|above|more than|greater than|at least|in excess of)\s*' || cur || num || '\s*' || unit || '$');
  if m is not null then
    return array[replace(m[2], ',', '')::numeric * public.iconn_unit(m[3]), null];
  end if;

  m := regexp_match(s, '^(<=?|under|below|less than|up to)\s*' || cur || num || '\s*' || unit || '$');
  if m is not null then
    return array[0, replace(m[2], ',', '')::numeric * public.iconn_unit(m[3])];
  end if;

  m := regexp_match(s, '^(?:(?:circa|approx|approximately|around|about|c|~)\.?\s*)?' || cur || num || '\s*' || unit || '$');
  if m is not null then
    lo := replace(m[1], ',', '')::numeric * public.iconn_unit(m[2]);
    return array[lo, lo];
  end if;

  return null;
end
$$;


-- Investor type -> a coarse group, so "Single-Family Office" (Opportunities)
-- and "Family Office" (iConnections) agree, and "Public D.B." is a pension.
-- Family offices and wealth managers share a group: the two labels are used
-- for the same firms too often to call it a conflict. NULL = no opinion.
create or replace function public.iconn_type_group(p text)
returns text
language sql immutable parallel safe
set search_path = public
as $$
  select case
    when t = '' then null
    when t ~ 'sovereign|permanent fund|\mswf\M' then 'sovereign'
    when t ~ 'family|\m(sfo|mfo)\M|wealth|\mria\M|registered investment advis|private bank' then 'private_wealth'
    when t ~ 'pension|retirement|superannuation|provident|cash balance|\md\.?\s?[bc]\.?(\M|$)' then 'pension'
    when t ~ 'endowment|foundation|non-?profit|universit|charit' then 'endowment_foundation'
    when t ~ 'insur|health plan' then 'insurance'
    when t ~ 'fund of funds|fund-of-funds|manager of managers|\mfof\M|multi-manager|ocio|outsourced' then 'fund_of_funds'
    when t ~ 'consult' then 'consultant'
    when t ~ 'bank' then 'bank'
    when t ~ 'corporat|treasury|operating fund|surplus' then 'corporate'
    when t ~ 'hedge fund|private equity|venture|asset manag|credit|\mmanager\M' then 'asset_manager'
  end
  from (select lower(btrim(coalesce(p, ''))) as t) x
$$;

-- The two thresholds, in one place. A fuzzy score at or above "auto" is a
-- match; between "review" and "auto" it goes to Needs review with its
-- candidates; below "review" it is No match. Set from the dry-run of 26 Oct
-- 2026 against the live opportunity names (see the commit message).
create or replace function public.iconn_thresholds()
returns jsonb
language sql immutable parallel safe
set search_path = public
as $$ select '{"auto": 0.75, "review": 0.45, "too_close": 0.03}'::jsonb $$;

-- ---------------------------------------------------------------------
-- 3. STAGING
--    One run per file, keyed on the file's SHA-256 (computed in the
--    browser). Uploading the same file again reuses its run: import_no goes
--    up by one and the rows are overwritten in place, keyed on the sheet's
--    own row number. Rows from an earlier import of the same file that the
--    new one did not send stay in the table under their old import_no, so
--    nothing is deleted, and console_iconnections_run shows only the latest.
-- ---------------------------------------------------------------------
create table if not exists public.iconnections_import_runs (
  id              bigint generated always as identity primary key,
  file_sha256     text not null unique check (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_name       text,
  sheet_name      text,
  columns         jsonb not null default '{}'::jsonb,   -- field -> the header it was read from
  thresholds      jsonb,
  import_no       int not null default 1,
  row_count       int,
  created_at      timestamptz not null default now(),
  created_by      text default (auth.jwt() ->> 'email'),
  last_matched_at timestamptz not null default now(),
  matched_by      text default (auth.jwt() ->> 'email')
);

create table if not exists public.iconnections_import_rows (
  run_id        bigint not null references public.iconnections_import_runs (id) on delete cascade,
  row_no        int    not null check (row_no > 0),       -- the row number in the sheet
  import_no     int    not null,
  raw           jsonb  not null default '{}'::jsonb,     -- the mapped cells as they were in the file
  name          text   not null,
  domain        text,
  aum_text      text,
  aum_low       numeric,
  aum_high      numeric,
  investor_type text,
  country       text,
  norm_name     text,
  bucket        text check (bucket in ('matched', 'review', 'none')),
  match_method  text check (match_method in ('exact', 'alias', 'fuzzy')),
  confidence    numeric(4,3),
  matched_id    bigint,          -- wi_mandates.id; no foreign key, a run is a record of its day
  matched_name  text,
  opp_ids       bigint[],        -- every opportunity row behind the match
  candidates    jsonb,
  conflicts     jsonb,
  domain_check  text check (domain_check in ('confirms', 'differs')),
  matched_at    timestamptz not null default now(),
  primary key (run_id, row_no)
);

create index if not exists iconnections_import_rows_matched on public.iconnections_import_rows (run_id, import_no, matched_id);

alter table public.iconnections_import_runs enable row level security;
alter table public.iconnections_import_rows enable row level security;

drop policy if exists console_read    on public.iconnections_import_runs;
drop policy if exists runs_add        on public.iconnections_import_runs;
drop policy if exists runs_edit       on public.iconnections_import_runs;
drop policy if exists automation_full on public.iconnections_import_runs;
create policy console_read    on public.iconnections_import_runs for select using (is_console_user());
create policy runs_add        on public.iconnections_import_runs for insert with check (is_console_user());
create policy runs_edit       on public.iconnections_import_runs for update using (is_console_user()) with check (is_console_user());
create policy automation_full on public.iconnections_import_runs for all to taranis_bot using (true) with check (true);

drop policy if exists console_read    on public.iconnections_import_rows;
drop policy if exists rows_add        on public.iconnections_import_rows;
drop policy if exists rows_edit       on public.iconnections_import_rows;
drop policy if exists automation_full on public.iconnections_import_rows;
create policy console_read    on public.iconnections_import_rows for select using (is_console_user());
create policy rows_add        on public.iconnections_import_rows for insert with check (is_console_user());
create policy rows_edit       on public.iconnections_import_rows for update using (is_console_user()) with check (is_console_user());
create policy automation_full on public.iconnections_import_rows for all to taranis_bot using (true) with check (true);

revoke all on public.iconnections_import_runs, public.iconnections_import_rows from anon;

-- ---------------------------------------------------------------------
-- 4. MATCHING (read-only)
--    p_rows: [{row_no, name, domain, aum_low, aum_high, investor_type,
--    country}] — country as ISO-2, AUM in USD, as the console parsed them.
--    For each row, in order:
--      exact  the normalised name equals an opportunity's normalised
--             investor or organisation name                (confidence 1)
--      alias  the name, or its bracketed acronym, is an alias whose full
--             name is an opportunity; or the opportunity is stored under
--             an alias / acronym of the row's name         (confidence 0.95;
--             0.90 through an acronym alone, and Needs review if that
--             acronym points at more than one investor)
--      fuzzy  trigram score = average of full-name and core-name
--             similarity (full only, capped at 0.6, when either side has
--             no core). >= auto: matched, unless the runner-up is within
--             too_close of it; >= review: Needs review; else No match.
--             Below "auto" nothing is ever called a match.
--    A website domain moves a fuzzy score: +0.05 when a contact at that
--    domain works for the matched investor, -0.10 when contacts there all
--    work somewhere else (also reported as a conflict). It never creates a
--    match on its own.
--    Opportunities in To validate (validation_status = 'pending') are left
--    out, as they are everywhere else in the console.
--    Runs as the caller (SECURITY INVOKER), so RLS applies. It builds three
--    temporary tables that disappear at the end of the transaction; the
--    trigram indexes on them keep a 250-row call well under a second.
-- ---------------------------------------------------------------------
create or replace function public.iconn_match_rows(p_rows jsonb)
returns table (
  row_no int, norm_name text, bucket text, match_method text, confidence numeric,
  matched_id bigint, matched_name text, opp_ids bigint[], candidates jsonb,
  conflicts jsonb, domain_check text)
language plpgsql volatile
set search_path = public
set pg_trgm.similarity_threshold = '0.3'
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
  -- t_review must stay >= the 0.3 trigram threshold above, or the index
  -- would hide candidates that score between the two.

  drop table if exists pg_temp.iconn_opp;
  create temp table iconn_opp on commit drop as
    select m.id,
           coalesce(nullif(btrim(m.investor_name), ''), btrim(m.organization_name)) as label,
           m.investor_type,
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
    select k.key, iconn_core_name(k.key) as core, array_agg(k.id order by k.id) as ids
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
               round((case when i.core <> '' and f.core <> ''
                           then (similarity(i.n, f.key) + similarity(i.core, f.core)) / 2
                           else least(similarity(i.n, f.key), 0.6) end)::numeric, 3) as score
          from iconn_fkey f
         where f.key % i.n or (i.core <> '' and f.core % i.core)
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
         b.domain_check
    from bucketed b
    -- The opportunity shown for a match: the newest row behind it.
    left join lateral (
      select o.id, o.label from iconn_opp o
       where b.bucket = 'matched' and o.id = any(b.ids)
       order by o.alert_date desc nulls last, o.id desc limit 1) rep on true
    -- What a reviewer chooses between: the fuzzy runners-up, or the
    -- investors an ambiguous acronym points at. One entry per investor,
    -- each represented by its newest row.
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.label, 'score', c.score, 'rows', c.rows)
                       order by c.score desc, c.label) as list
        from (
          select distinct on (g.key) g.key, g.score, o.id, o.label, cardinality(g.ids) as rows
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

-- ---------------------------------------------------------------------
-- 5. CONSOLE FUNCTIONS
-- ---------------------------------------------------------------------

-- Stage and match one chunk (at most 1,000 rows; the console sends 250).
-- p_first = true on the first chunk of an upload starts a new import of the
-- file. Returns {run_id, import_no, rows}.
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
         (run_id, row_no, import_no, raw, name, domain, aum_text, aum_low, aum_high, investor_type, country,
          norm_name, bucket, match_method, confidence, matched_id, matched_name, opp_ids, candidates,
          conflicts, domain_check, matched_at)
  select v_run, x.row_no, v_import, coalesce(x.raw, '{}'::jsonb), btrim(x.name),
         nullif(lower(btrim(x.domain)), ''), left(x.aum_text, 200), x.aum_low, x.aum_high,
         left(x.investor_type, 200), nullif(upper(btrim(x.country)), ''),
         m.norm_name, m.bucket, m.match_method, m.confidence, m.matched_id, m.matched_name, m.opp_ids,
         m.candidates, m.conflicts, m.domain_check, now()
    from jsonb_to_recordset(p_rows) as x(row_no int, raw jsonb, name text, domain text, aum_text text,
                                         aum_low numeric, aum_high numeric, investor_type text, country text)
    join iconn_match_rows(p_rows) m on m.row_no = x.row_no
  on conflict (run_id, row_no) do update
     set import_no = excluded.import_no, raw = excluded.raw, name = excluded.name, domain = excluded.domain,
         aum_text = excluded.aum_text, aum_low = excluded.aum_low, aum_high = excluded.aum_high,
         investor_type = excluded.investor_type, country = excluded.country, norm_name = excluded.norm_name,
         bucket = excluded.bucket, match_method = excluded.match_method, confidence = excluded.confidence,
         matched_id = excluded.matched_id, matched_name = excluded.matched_name, opp_ids = excluded.opp_ids,
         candidates = excluded.candidates, conflicts = excluded.conflicts,
         domain_check = excluded.domain_check, matched_at = excluded.matched_at;

  update iconnections_import_runs r
     set row_count = (select count(*) from iconnections_import_rows t where t.run_id = r.id and t.import_no = r.import_no)
   where r.id = v_run;

  return jsonb_build_object('run_id', v_run, 'import_no', v_import, 'rows', v_n);
end
$$;

-- Read a run back: the latest import of it, every row, and the flags that
-- need all rows at once. upload_dupes lists the other sheet rows that
-- landed on the same opportunity.
create or replace function public.console_iconnections_run(p_run_id bigint)
returns jsonb
language sql stable
set search_path = public
as $$
  with run as (
    select * from iconnections_import_runs where id = p_run_id
  ),
  r as (
    select t.*,
           case when t.matched_id is not null
                then array_remove(array_agg(t.row_no) over (partition by t.matched_id), t.row_no) end as upload_dupes
      from iconnections_import_rows t join run on run.id = t.run_id and t.import_no = run.import_no
  )
  select case when not exists (select 1 from run) then null else jsonb_build_object(
    'run', (select jsonb_build_object('id', id, 'file_name', file_name, 'sheet_name', sheet_name,
                                      'columns', columns, 'thresholds', thresholds, 'import_no', import_no,
                                      'row_count', row_count, 'created_at', created_at,
                                      'last_matched_at', last_matched_at) from run),
    'counts', (select jsonb_build_object(
                 'matched',    count(*) filter (where bucket = 'matched'),
                 'review',     count(*) filter (where bucket = 'review'),
                 'none',       count(*) filter (where bucket = 'none'),
                 'duplicates', count(*) filter (where cardinality(opp_ids) > 1 or cardinality(upload_dupes) > 0),
                 'conflicts',  count(*) filter (where conflicts is not null)) from r),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                 'row_no', row_no, 'name', name, 'domain', domain, 'aum_text', aum_text,
                 'investor_type', investor_type, 'country', country,
                 'bucket', bucket, 'match_method', match_method, 'confidence', confidence,
                 'matched_id', matched_id, 'matched_name', matched_name, 'opp_ids', opp_ids,
                 'upload_dupes', upload_dupes, 'candidates', candidates, 'conflicts', conflicts,
                 'domain_check', domain_check)
               order by case bucket when 'matched' then 0 when 'review' then 1 else 2 end, row_no) from r), '[]'::jsonb)
  ) end
$$;

revoke all on function public.iconn_match_rows(jsonb) from public, anon;
revoke all on function public.console_iconnections_match(text, text, text, jsonb, boolean, jsonb) from public, anon;
revoke all on function public.console_iconnections_run(bigint) from public, anon;
grant execute on function public.iconn_match_rows(jsonb) to authenticated, service_role, taranis_bot;
grant execute on function public.console_iconnections_match(text, text, text, jsonb, boolean, jsonb) to authenticated, service_role, taranis_bot;
grant execute on function public.console_iconnections_run(bigint) to authenticated, service_role, taranis_bot;

-- ---------------------------------------------------------------------
-- ROLLBACK (removes the import and its staged runs; aliases stay usable)
--   drop function if exists public.console_iconnections_run(bigint);
--   drop function if exists public.console_iconnections_match(text, text, text, jsonb, boolean, jsonb);
--   drop function if exists public.iconn_match_rows(jsonb);
--   drop table if exists public.iconnections_import_rows;
--   drop table if exists public.iconnections_import_runs;
--   drop function if exists public.iconn_thresholds();
--   drop function if exists public.iconn_type_group(text);
--   drop function if exists public.iconn_aum_bounds(text);
--   drop function if exists public.iconn_unit(text);
--   drop function if exists public.iconn_acronym(text);
--   drop function if exists public.iconn_core_name(text);
--   drop function if exists public.iconn_norm_name(text);
-- Aliases, only if those changes are withdrawn too:
--   delete from public.investor_aliases where note = 'seed: schema-15';
--   update public.investor_aliases set alias = 'masspRim' where alias = 'massprim';
--   drop policy if exists console_read on public.investor_aliases;  (and aliases_add,
--     aliases_edit, aliases_remove, automation_full)
--   drop trigger if exists investor_aliases_tidy on public.investor_aliases;
--   drop function if exists public.investor_aliases_tidy();
--   alter table public.investor_aliases drop column if exists created_by,
--     drop column if exists created_at, drop column if exists note;
-- ---------------------------------------------------------------------
