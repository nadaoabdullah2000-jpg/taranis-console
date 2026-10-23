-- =====================================================================
-- Taranis Console — tables the app needs on top of what already exists.
--
-- Sections 1-4 do not touch contacts, crm_emails, wi_mandates, documents,
-- linkedin_connections or group_message_queue. Those stay exactly as the
-- workflows left them. This adds the layer Telegram used to provide:
-- who is allowed in, what is waiting for them, and what they did.
--
-- Section 5 is the exception, and additive only: two columns on wi_mandates,
-- trigram indexes and the company-search functions (schema-13, with
-- console_search_company as replaced by schema-14). tests/schema-sync checks
-- it against those two files.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. WHO IS ALLOWED IN
--    Replaces `message.from.id = '848084617'`, which was the whole of
--    the old authorisation check. An allow list, so signing up to
--    Supabase is not by itself a way in.
-- ---------------------------------------------------------------------
create table if not exists console_users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  full_name   text,
  role        text not null default 'operator'
                check (role in ('admin','operator','viewer')),
  is_active   boolean not null default true,
  telegram_id text,                       -- kept for the parallel-run period
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);

insert into console_users (email, full_name, role, telegram_id)
values ('antoine@taranis.net', 'Antoine Megarbane', 'admin', '848084617')
on conflict (email) do nothing;


-- ---------------------------------------------------------------------
-- 2. WHAT IS WAITING
--    Every message the workflows currently send to Telegram gets written
--    here as well. The console reads this; the Today tab is this table.
-- ---------------------------------------------------------------------
create table if not exists app_notifications (
  id          bigserial primary key,
  kind        text not null,             -- review | matched | followup | health | email | doc
  source      text not null,             -- WI | CRM | LI | OPS
  title       text not null,
  subtitle    text,
  fields      jsonb not null default '[]'::jsonb,   -- [{label,value}]
  review_id   text,
  mandate_id  bigint,
  contact_id  bigint,
  audience    text not null default 'admin',        -- admin | team
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists app_notifications_unread
  on app_notifications (created_at desc) where read_at is null;


-- ---------------------------------------------------------------------
-- 3. WHAT WAS DONE
--    Telegram was the audit trail. Once it is gone, this is.
--    Approvals, sends, edits and overrides all land here.
-- ---------------------------------------------------------------------
create table if not exists console_audit (
  id         bigserial primary key,
  actor      text not null,
  action     text not null,             -- wi.review.approve, crm.email.send, ...
  payload    jsonb,
  result     text,                      -- ok | error
  detail     text,
  ip         inet,
  created_at timestamptz not null default now()
);
create index if not exists console_audit_recent on console_audit (created_at desc);


-- ---------------------------------------------------------------------
-- 4. MEETINGS
--    Nothing in the eighteen workflows books a call. This is the table
--    the Zoom workflow will write to, so a meeting sits on the contact
--    record next to the email history.
-- ---------------------------------------------------------------------
create table if not exists meetings (
  id           bigserial primary key,
  provider     text not null default 'zoom',
  external_id  text unique,
  contact_id   bigint,
  contact_name text,
  topic        text,
  start_time   timestamptz,
  duration_min int default 30,
  join_url     text,
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists meetings_upcoming on meetings (start_time)
  where start_time > now();


-- =====================================================================
-- ROW LEVEL SECURITY
-- The browser holds only the anon key. These policies are what stop it
-- being useful to anyone who is not on the allow list.
-- =====================================================================
alter table console_users     enable row level security;
alter table app_notifications enable row level security;
alter table console_audit     enable row level security;
alter table meetings          enable row level security;

create or replace function is_console_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from console_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
      and is_active
  );
$$;

drop policy if exists cu_self on console_users;
create policy cu_self on console_users for select
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));

drop policy if exists an_read on app_notifications;
create policy an_read on app_notifications for select using (is_console_user());

drop policy if exists an_mark on app_notifications;
create policy an_mark on app_notifications for update using (is_console_user())
  with check (is_console_user());

-- The audit log is append-only from the app's point of view: readable,
-- never editable, never deletable. n8n writes to it with the service key.
drop policy if exists ca_read on console_audit;
create policy ca_read on console_audit for select using (is_console_user());

drop policy if exists mt_read on meetings;
create policy mt_read on meetings for select using (is_console_user());


-- =====================================================================
-- HELPER — call this from every workflow that currently sends Telegram.
-- One line added next to the Telegram node keeps both channels in step
-- during the parallel run, and becomes the only channel afterwards.
-- =====================================================================
create or replace function notify_console(
  p_kind text, p_source text, p_title text, p_subtitle text default null,
  p_fields jsonb default '[]'::jsonb, p_review_id text default null,
  p_mandate_id bigint default null
) returns bigint language sql as $$
  insert into app_notifications (kind, source, title, subtitle, fields, review_id, mandate_id)
  values (p_kind, p_source, p_title, p_subtitle, p_fields, p_review_id, p_mandate_id)
  returning id;
$$;


-- =====================================================================
-- 5. TECH-INVESTOR FLAG AND COMPANY SEARCH   (schema-13, 23 Oct 2026)
-- =====================================================================
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
--
-- One WI alert often arrives in several same-day emails and is stored once per
-- email (ADIA 1508 / 1519 / 1537: same alert, different record_key and
-- source_email_date; dupe_of_id and content_hash are not set on them). The
-- mandates list shows each alert once: rows with the same
--   lower(coalesce(organization_name, investor_name)), intention_summary,
--   alert_type, alert_date and source_subject
-- collapse to the most recent copy by source_email_date (then the highest id,
-- so "Open" goes to a real row), with source_count saying how many copies
-- there were. Rows that differ on any of those stay separate. The tags take
-- the group's value (copies never disagree, but some carry NULL), and the
-- group is an exact match if any copy is. The network still reads every copy.
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
  mand_all as (
    select m.id, m.investor_name, m.organization_name, m.investor_country, m.investor_type,
           m.investor_tag, m.alert_date, m.new_qualification, m.new_fit_score,
           m.intention_summary, m.published_at, m.is_tech_investor, m.open_to_emerging_markets,
           m.linkedin_url, m.view_intention_url, m.view_investor_url, m.view_article_url,
           m.source_email_date,
           case when lower(btrim(coalesce(m.investor_name, ''))) = p.ln
                  or lower(btrim(coalesce(m.organization_name, ''))) = p.ln
                then 'exact' else 'partial' end as match,
           lower(coalesce(m.organization_name, m.investor_name)) as sig_name,
           coalesce(m.intention_summary, '')  as sig_summary,
           coalesce(m.alert_type, '')         as sig_type,
           coalesce(m.alert_date::text, '')   as sig_date,
           coalesce(m.source_subject, '')     as sig_subject
      from wi_mandates m, p
     where length(p.n) >= 2
       and coalesce(m.validation_status, '') <> 'pending'
       and (   lower(btrim(coalesce(m.investor_name, ''))) = p.ln
            or lower(btrim(coalesce(m.organization_name, ''))) = p.ln
            or (p.partial_ok and (m.investor_name ilike '%' || p.esc || '%'
                               or m.organization_name ilike '%' || p.esc || '%')))
  ),
  mand_ranked as (
    select a.*,
           row_number() over w_order                       as copy_rank,
           count(*) over w                                 as source_count,
           bool_or(a.is_tech_investor) over w              as group_tech,
           bool_or(a.open_to_emerging_markets) over w      as group_em,
           bool_or(a.match = 'exact') over w               as group_exact
      from mand_all a
    window w       as (partition by a.sig_name, a.sig_summary, a.sig_type, a.sig_date, a.sig_subject),
           w_order as (partition by a.sig_name, a.sig_summary, a.sig_type, a.sig_date, a.sig_subject
                       order by a.source_email_date desc nulls last, a.id desc)
  ),
  mand as (
    select r.id, r.investor_name, r.organization_name, r.investor_country, r.investor_type,
           r.investor_tag, r.alert_date, r.new_qualification, r.new_fit_score,
           r.intention_summary, r.published_at,
           r.group_tech as is_tech_investor, r.group_em as open_to_emerging_markets,
           r.linkedin_url, r.view_intention_url, r.view_investor_url, r.view_article_url,
           case when r.group_exact then 'exact' else 'partial' end as match,
           r.source_count
      from mand_ranked r
     where r.copy_rank = 1
     order by (case when r.group_exact then 0 else 1 end),
              r.alert_date desc nulls last, r.id desc
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
      from mand_all m where m.linkedin_url is not null
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
