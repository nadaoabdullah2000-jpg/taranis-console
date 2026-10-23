-- Schema 13: tech-investor flag on wi_mandates, and company search.
--
-- Additive only. Nothing here changes a stored value: the two new columns
-- start NULL ("not assessed") and are filled by enrich-2026-10-23.sql, which
-- snapshots every row it touches first. Safe to run twice.
--
-- Mirrored in schema.sql, section 5. Run this file once in the SQL editor.

-- ---------------------------------------------------------------------
-- 1. TECH INVESTOR
--    is_tech_investor: true  = the text gives concrete evidence of a
--                              technology / software / fintech focus
--                      false = the text says the focus is elsewhere
--                              (real estate, credit, infrastructure …) or
--                              turns technology away
--                      NULL  = not assessed, or no signal either way
--    tech_signal:      the field and sentence the value rests on.
-- ---------------------------------------------------------------------
alter table public.wi_mandates
  add column if not exists is_tech_investor boolean,
  add column if not exists tech_signal      text;

comment on column public.wi_mandates.is_tech_investor is
  'true/false from concrete text evidence (see tech_signal); NULL = not assessed or no signal.';
comment on column public.wi_mandates.tech_signal is
  'Where is_tech_investor came from: "<field>: <sentence>". Set by enrich-2026-10-23.sql.';

-- ---------------------------------------------------------------------
-- 2. TRIGRAM INDEXES FOR TYPE-AHEAD
--    pg_trgm makes ILIKE '%part%' and the <% word-similarity operator
--    index-backed, so partial words and small typos find a company fast.
--    contacts.name / contacts.company already have these indexes; they
--    are listed so a fresh database gets them too.
-- ---------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists wi_mandates_investor_name_trgm
  on public.wi_mandates using gin (investor_name gin_trgm_ops);
create index if not exists wi_mandates_organization_name_trgm
  on public.wi_mandates using gin (organization_name gin_trgm_ops);
create index if not exists idx_contacts_company
  on public.contacts using gin (company gin_trgm_ops);
create index if not exists idx_contacts_name
  on public.contacts using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 3. SEARCH FUNCTIONS
--    One definition used by both paths: the console calls them through
--    PostgREST (/rest/v1/rpc/…), and the gateway's search.suggest /
--    search.company actions call them with query parameters. The text
--    typed is only ever a bound argument, never part of the SQL.
--
--    SECURITY INVOKER (the default): row-level security applies to the
--    caller, so a console user sees exactly what is_console_user() allows.
--    Rows waiting in To validate (validation_status = 'pending') are left
--    out, as they are everywhere else in the console.
--
--    LinkedIn data holds people, not companies (linkedin_connections has
--    account_id, slug, full_name), so it is not a source of company names.
--    A company's network is the LinkedIn profiles of its contacts and
--    mandates, matched to linkedin_mutual for who here can reach them.
-- ---------------------------------------------------------------------

-- search.suggest: up to p_limit company names that match what was typed.
-- Names from every source are merged case-insensitively ("Mirabaud" and
-- "MIRABAUD" are one suggestion); kind lists the sources it came from and
-- count how many rows carry it. Ranked: exact, starts with, a word starts
-- with, contains, then close spellings.
create or replace function public.console_search_suggest(p_q text, p_limit int default 10)
returns table (name text, kind text, count bigint)
language sql stable
set search_path = public
as $$
  with q as (
    select btrim(coalesce(p_q, ''))                                        as q,
           lower(btrim(coalesce(p_q, '')))                                 as lq,
           replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') as esc,
           least(greatest(coalesce(p_limit, 10), 1), 25)                   as lim
  ),
  src as (
    select btrim(m.investor_name) as nm, 'mandate' as kind
      from wi_mandates m
     where coalesce(m.validation_status, '') <> 'pending'
       and btrim(coalesce(m.investor_name, '')) <> ''
    union all
    select btrim(m.organization_name), 'mandate'
      from wi_mandates m
     where coalesce(m.validation_status, '') <> 'pending'
       and btrim(coalesce(m.organization_name, '')) <> ''
       and lower(btrim(m.organization_name)) <> lower(btrim(coalesce(m.investor_name, '')))
    union all
    select btrim(c.company), 'contact'
      from contacts_app c
     where btrim(coalesce(c.company, '')) <> ''
  ),
  hit as (
    select s.nm, s.kind,
           case when lower(s.nm) = q.lq                     then 0
                when lower(s.nm) like q.lq || '%'           then 1
                when lower(s.nm) like '% ' || q.lq || '%'   then 2
                when strpos(lower(s.nm), q.lq) > 0          then 3
                else 4 end                                  as rank,
           word_similarity(q.q, s.nm)                       as sim
      from src s, q
     where length(q.q) >= 2
       and (s.nm ilike '%' || q.esc || '%' or q.q <% s.nm)
  )
  select mode() within group (order by h.nm)        as name,
         string_agg(distinct h.kind, ',')           as kind,
         count(*)                                   as count
    from hit h
   group by lower(h.nm)
   order by min(h.rank), max(h.sim) desc, count(*) desc, lower(h.nm)
   limit (select lim from q)
$$;

-- search.company: everything held on one company. Exact (case-insensitive)
-- matches first, then names that contain it (only for 4+ characters, so
-- "IT" does not pull in every name with "it" in it). Each row says which.
create or replace function public.console_search_company(p_name text)
returns jsonb
language sql stable
set search_path = public
as $$
  with p as (
    select btrim(coalesce(p_name, ''))         as n,
           lower(btrim(coalesce(p_name, '')))  as ln,
           replace(replace(replace(btrim(coalesce(p_name, '')), '\', '\\'), '%', '\%'), '_', '\_') as esc,
           length(btrim(coalesce(p_name, ''))) >= 4 as partial_ok
  ),
  mand as (
    select m.id, m.investor_name, m.organization_name, m.investor_country, m.investor_type,
           m.investor_tag, m.alert_date, m.new_qualification, m.new_fit_score,
           m.intention_summary, m.published_at, m.is_tech_investor, m.open_to_emerging_markets,
           m.linkedin_url, m.view_intention_url, m.view_investor_url, m.view_article_url,
           case when lower(btrim(coalesce(m.investor_name, ''))) = p.ln
                  or lower(btrim(coalesce(m.organization_name, ''))) = p.ln
                then 'exact' else 'partial' end as match
      from wi_mandates m, p
     where length(p.n) >= 2
       and coalesce(m.validation_status, '') <> 'pending'
       and (   lower(btrim(coalesce(m.investor_name, ''))) = p.ln
            or lower(btrim(coalesce(m.organization_name, ''))) = p.ln
            or (p.partial_ok and (m.investor_name ilike '%' || p.esc || '%'
                               or m.organization_name ilike '%' || p.esc || '%')))
     order by (case when lower(btrim(coalesce(m.investor_name, ''))) = p.ln
                      or lower(btrim(coalesce(m.organization_name, ''))) = p.ln then 0 else 1 end),
              m.alert_date desc nulls last, m.id desc
     limit 50
  ),
  cont as (
    select a.id, a.name, a.role, a.title, a.company, a.email, a.country, a.city,
           a.relationship, a.knows_us, a.last_contact_at, c.linkedin_url,
           case when lower(btrim(a.company)) = p.ln then 'exact' else 'partial' end as match
      from contacts_app a join contacts c on c.id = a.id, p
     where length(p.n) >= 2
       and (lower(btrim(coalesce(a.company, ''))) = p.ln
            or (p.partial_ok and a.company ilike '%' || p.esc || '%'))
     order by (case when lower(btrim(a.company)) = p.ln then 0 else 1 end),
              a.last_contact_at desc nulls last, a.name
     limit 50
  ),
  docs as (
    select d.id, d.doc_key, d.title, d.version_label, d.period_date, d.public_url, d.uploaded_at
      from document_latest d, p
     where p.partial_ok
       and (d.title ilike '%' || p.esc || '%' or d.notes ilike '%' || p.esc || '%'
            or d.file_name ilike '%' || p.esc || '%')
     order by d.uploaded_at desc
     limit 20
  ),
  people as (
    select lower(substring(c.linkedin_url from 'linkedin\.com/in/([^/?#[:space:]]+)')) as slug,
           c.name as known_as, c.linkedin_url as url, 'contact' as via
      from cont c where c.linkedin_url is not null
    union
    select lower(substring(m.linkedin_url from 'linkedin\.com/in/([^/?#[:space:]]+)')),
           m.investor_name, m.linkedin_url, 'mandate'
      from mand m where m.linkedin_url is not null
  ),
  net as (
    select coalesce(lm.full_name, pe.known_as) as full_name,
           coalesce(lm.profile_url, pe.url)    as profile_url,
           pe.via,
           coalesce(lm.mutual_to, '{}')        as mutual_to,
           coalesce(lm.mutual_count, 0)        as mutual_count
      from people pe
      left join linkedin_mutual lm on lower(lm.slug) = pe.slug
     where pe.slug is not null
     order by coalesce(lm.mutual_count, 0) desc, 1
     limit 50
  )
  select jsonb_build_object(
    'name',      (select n from p),
    'mandates',  coalesce((select jsonb_agg(to_jsonb(x)) from mand x), '[]'::jsonb),
    'contacts',  coalesce((select jsonb_agg(to_jsonb(x)) from cont x), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(x)) from docs x), '[]'::jsonb),
    'network',   coalesce((select jsonb_agg(to_jsonb(x)) from net  x), '[]'::jsonb)
  )
$$;

revoke all on function public.console_search_suggest(text, int) from public, anon;
revoke all on function public.console_search_company(text)      from public, anon;
grant execute on function public.console_search_suggest(text, int) to authenticated, service_role, taranis_bot;
grant execute on function public.console_search_company(text)      to authenticated, service_role, taranis_bot;

-- ---------------------------------------------------------------------
-- ROLLBACK (only if both features are withdrawn; drops the stored values)
--   drop function if exists public.console_search_company(text);
--   drop function if exists public.console_search_suggest(text, int);
--   drop index if exists public.wi_mandates_organization_name_trgm;
--   drop index if exists public.wi_mandates_investor_name_trgm;
--   alter table public.wi_mandates drop column if exists tech_signal,
--                                  drop column if exists is_tech_investor;
-- (pg_trgm and the two contacts indexes predate this file; leave them.)
-- ---------------------------------------------------------------------
