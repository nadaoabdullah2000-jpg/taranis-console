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
--
-- Section 6 (schema-15) matches an iConnections export against
-- Opportunities. It reads wi_mandates and never writes to it; it makes
-- investor_aliases editable and adds two staging tables. Section 7
-- (schema-16) adds the matched opportunity's Taranis fit to what the
-- matcher returns; display only. Both checked by tests/schema-sync.
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


-- =====================================================================
-- 6. ICONNECTIONS MATCHING   (schema-15, 26 Oct 2026)
-- =====================================================================
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
  ('cdpq',  'Caisse de depot et placement du Quebec',     'seed: schema-15'),
  ('cpp investment board', 'Canada Pension Plan Investment Board', 'seed: schema-15')
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

-- The numbers in a normalised name, as one string ("phoenix 5" -> "5",
-- "47 capital" -> "47"). Two names whose numbers differ are never called the
-- same firm on spelling alone.
create or replace function public.iconn_digits(p_norm text)
returns text
language sql immutable parallel safe
set search_path = public
as $$
  select coalesce(string_agg(t, ' ' order by t), '')
    from regexp_split_to_table(coalesce(p_norm, ''), ' ') t
   where t ~ '[0-9]'
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
  row_no        int    not null check (row_no > 0),       -- the first sheet row with this firm
  import_no     int    not null,
  contacts      int    not null default 1 check (contacts > 0),  -- sheet rows (people) at this firm
  row_nos       int[],                                    -- every sheet row with this firm
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
  matched_status text,           -- its verdict: new_qualification, else qualification
  opp_ids       bigint[],        -- every opportunity row behind the match
  opp_rejected  int,             -- how many of them are rejected
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
-- Stated rather than left to the running role's default privileges, so the
-- file works whoever runs it. RLS above still decides which rows.
grant select, insert, update on public.iconnections_import_runs, public.iconnections_import_rows
  to authenticated, service_role, taranis_bot;

-- ---------------------------------------------------------------------
-- 4. MATCHING (read-only)
--    p_rows: [{row_no, name, domain, aum_low, aum_high, investor_type,
--    country}] — country as ISO-2, AUM in USD, as the console parsed them.
--    Every field but the name may be missing: a file with only a firm column
--    is matched on the name alone, and nothing is compared that the file
--    does not hold, so a missing column never creates or removes a match or
--    a conflict.
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
--             no core). Two adjustments, both towards review, never to a
--             match: names whose numbers differ ("Phoenix-5" / "Phoenix")
--             are capped at 0.6; a file name of 5+ letters that is the
--             opening words of a stored one ("Stifel" / "Stifel Nicolaus")
--             is raised to at least 0.72. >= auto: matched, unless the runner-up is
--             within too_close of it; >= review: Needs review; else No
--             match. Below "auto" nothing is ever called a match.
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
  conflicts jsonb, domain_check text, matched_status text, opp_rejected int)
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
         (select count(*)::int from iconn_opp o where b.bucket = 'matched' and o.id = any(b.ids) and o.verdict = 'rejected')
    from bucketed b
    -- The opportunity shown for a match: the one still most in play behind
    -- it (matched, then review, low fit, needs data, rejected), newest first.
    -- So a firm shows as rejected only when every row behind it is.
    left join lateral (
      select o.id, o.label, o.verdict from iconn_opp o
       where b.bucket = 'matched' and o.id = any(b.ids)
       order by case o.verdict when 'matched' then 5 when 'uncertain' then 4 when 'low' then 3
                               when 'needs_data' then 2 when 'rejected' then 1 else 0 end desc,
                o.alert_date desc nulls last, o.id desc
       limit 1) rep on true
    -- What a reviewer chooses between: the fuzzy runners-up, or the
    -- investors an ambiguous acronym points at. One entry per investor,
    -- each represented by its newest row.
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.label, 'score', c.score, 'rows', c.rows, 'status', c.verdict)
                       order by c.score desc, c.label) as list
        from (
          select distinct on (g.key) g.key, g.score, o.id, o.label, o.verdict, cardinality(g.ids) as rows
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
         (run_id, row_no, import_no, contacts, row_nos, raw, name, domain, aum_text, aum_low, aum_high, investor_type, country,
          norm_name, bucket, match_method, confidence, matched_id, matched_name, matched_status, opp_ids, opp_rejected,
          candidates, conflicts, domain_check, matched_at)
  select v_run, x.row_no, v_import, greatest(coalesce(x.contacts, 1), 1), coalesce(x.row_nos, array[x.row_no]),
         coalesce(x.raw, '{}'::jsonb), btrim(x.name),
         nullif(lower(btrim(x.domain)), ''), left(x.aum_text, 200), x.aum_low, x.aum_high,
         left(x.investor_type, 200), nullif(upper(btrim(x.country)), ''),
         m.norm_name, m.bucket, m.match_method, m.confidence, m.matched_id, m.matched_name, m.matched_status,
         m.opp_ids, m.opp_rejected, m.candidates, m.conflicts, m.domain_check, now()
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
         candidates = excluded.candidates, conflicts = excluded.conflicts,
         domain_check = excluded.domain_check, matched_at = excluded.matched_at;

  update iconnections_import_runs r
     set row_count = (select count(*) from iconnections_import_rows t where t.run_id = r.id and t.import_no = r.import_no)
   where r.id = v_run;

  return jsonb_build_object('run_id', v_run, 'import_no', v_import, 'rows', v_n);
end
$$;

-- Read a run back: the latest import of it, one entry per firm. A contacts
-- export repeats a firm once per person; the console already sends each
-- spelling once with its contact count, and here spellings that normalise to
-- the same name are folded together too ("Norges Bank" and "NORGES BANK").
-- The match depends only on the name, so it is the same for all of them; the
-- first one in the sheet supplies it, and conflicts from any are kept.
-- same_opportunity lists the other firms in the file that landed on the same
-- opportunity. rejected: every opportunity row behind the match is rejected.
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


-- =====================================================================
-- 7. ICONNECTIONS: TARANIS FIT IN THE RESULTS   (schema-16, 26 Oct 2026)
-- =====================================================================
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


-- =====================================================================
-- 8. ICONNECTIONS: TAKING A RUN OFF THE EARLIER MATCHES LIST   (schema-17, 26 Oct 2026)
-- =====================================================================
-- ---------------------------------------------------------------------
-- 1. HIDDEN RUNS
-- ---------------------------------------------------------------------
alter table public.iconnections_import_runs
  add column if not exists hidden_at timestamptz;   -- set when taken off the Earlier matches list; null = listed
