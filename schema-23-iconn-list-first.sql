-- Schema 23 (10 Nov 2026): an I-Connections firm gets its With Intelligence profile from the
-- user's own list first, then from Grok.
--  1. iconnections_import_rows keeps each firm's contacts with their position (contacts_detail)
--     and the firm's e-mail domains (email_domains, only the part after @, free-mail domains
--     dropped). console_iconnections_match stores them when the file is matched again.
--  2. iconn_norm / iconn_generic / iconn_name_rule: name matching that never links on one shared
--     common word ("Phoenix-5" is not "City of Phoenix ERS").
--  3. iconn_list_matches(run): for each firm, the rows of the list (Opportunities and Rejected,
--     excluded and merged included) that carry a With Intelligence link and match it by name,
--     acronym, contact person or website. News-headline rows are never used.
--  4. iconn_link_from_list(run, apply, only): dry run (apply = false) or link. A link is made only
--     when every match of the firm points at one With Intelligence id, and never for a firm a
--     person decided to leave unlinked or whose candidate a person rejected. Links are stored
--     like Grok's (iconn_wi_lookup, confidence Exact, tried {list}) and logged in wi_fill_log.
--  5. console_iconn_wi_profiles: every firm, with its link, profile and in_list: the best row of
--     the list with the same With Intelligence id, whatever its status, and its verdict.
--  6. grok.iconn_people + todo('iconnections'): Grok gets each firm's contacts (name, position)
--     and websites.
-- Undo: see the end of the file.

-- 1 ---------------------------------------------------------------------------------------------
alter table public.iconnections_import_rows
  add column if not exists contacts_detail jsonb,   -- [{name, position}] in sheet order, at most 500
  add column if not exists email_domains text[];    -- the firm's e-mail domains, e.g. {stifel.com}

create or replace function public.iconn_free_mail(d text) returns boolean
language sql immutable as $$
  select lower(coalesce(d, '')) = any (array['gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com','hotmail.co.uk',
    'outlook.com','live.com','msn.com','icloud.com','me.com','mac.com','aol.com','protonmail.com','proton.me','gmx.com','gmx.de',
    'web.de','qq.com','163.com','126.com','mail.com','yandex.com','yandex.ru','zoho.com','btinternet.com','comcast.net',
    'verizon.net','att.net','sbcglobal.net','bluewin.ch','orange.fr','free.fr','libero.it','naver.com'])
$$;

do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.console_iconnections_match(text,text,text,jsonb,boolean,jsonb)'::regprocedure);
  n := d;
  n := replace(n, 'matched_fit, matched_fit_reason, candidates, conflicts, domain_check, matched_at, people)',
                  'matched_fit, matched_fit_reason, candidates, conflicts, domain_check, matched_at, people, contacts_detail, email_domains)');
  n := replace(n, $s$           where btrim(coalesce(p.v, '')) <> '' and p.i <= 500)
    from jsonb_to_recordset$s$,
               $s$           where btrim(coalesce(p.v, '')) <> '' and p.i <= 500),
         -- Contacts with their position (schema-23): name 300, position 200 characters, 500 at most.
         (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('name', left(btrim(c.v ->> 'name'), 300),
                    'position', nullif(left(btrim(coalesce(c.v ->> 'position', '')), 200), ''))) order by c.i)
            from jsonb_array_elements(case when jsonb_typeof(x.contacts_detail) = 'array' then x.contacts_detail else '[]'::jsonb end)
                 with ordinality as c(v, i)
           where btrim(coalesce(c.v ->> 'name', '')) <> '' and c.i <= 500),
         -- The firm's e-mail domains: only the part after @, no free-mail domains, 50 at most.
         (select array_agg(q.d order by q.d) from (select distinct lower(btrim(e)) d from unnest(x.email_domains) e) q
           where q.d ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$' and length(q.d) <= 100 and not iconn_free_mail(q.d))
    from jsonb_to_recordset$s$);
  n := replace(n, '                                         people text[])',
                  '                                         people text[], contacts_detail jsonb, email_domains text[])');
  n := replace(n, 'domain_check = excluded.domain_check, matched_at = excluded.matched_at, people = excluded.people;',
                  'domain_check = excluded.domain_check, matched_at = excluded.matched_at, people = excluded.people,'
                  || ' contacts_detail = excluded.contacts_detail, email_domains = excluded.email_domains;');
  if n = d or (length(n) - length(d)) < 600 then raise exception 'console_iconnections_match text not as expected'; end if;
  execute n;
end $do$;

-- 2 ---------------------------------------------------------------------------------------------
create or replace function public.iconn_norm(n text) returns text
language sql immutable as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(lower(coalesce(n, '')), '\([^)]*\)', ' ', 'g'),
               '[’'']s\M', '', 'g'),
             '[^a-z0-9 ]', ' ', 'g'),
           '\m(the|inc|llc|ltd|limited|corp|corporation|co|company|sa|ag|plc|lp|llp|gmbh|pte|bv|nv|and|de)\M', ' ', 'g'),
         '\s+', ' ', 'g'))
$$;

-- Words too common to identify a firm on their own.
create or replace function public.iconn_generic(w text) returns boolean
language sql immutable as $$
  select w = any (string_to_array('capital partners partner management advisors advisory advisers adviser investment investments invest '
    || 'asset assets wealth group global fund funds city county state retirement system systems employees employee pension pensions '
    || 'bank trust financial associates family office offices international holdings holding private alternative alternatives '
    || 'securities foundation university of for public fire police teachers board council endowment insurance new north south '
    || 'east west american national first one true', ' '))
$$;

-- Why a firm's name and a row's name are the same firm, or null. Same name; the row's acronym;
-- or one name starts with the whole other one, whose first word is not a common word.
create or replace function public.iconn_name_rule(p_firm text, p_row text) returns text
language plpgsql immutable as $$
declare a text := iconn_norm(p_firm); b text := iconn_norm(p_row); s text; l text; f1 text; acr text;
begin
  if a = '' or b = '' then return null; end if;
  if a = b or replace(a, ' ', '') = replace(b, ' ', '') then return 'same name'; end if;
  for acr in select x[1] from regexp_matches(coalesce(p_row, ''), '\(([^)]{2,12})\)', 'g') x loop
    if length(a) >= 3 and iconn_norm(acr) = a then return 'acronym in the name'; end if;
  end loop;
  if array_length(string_to_array(a, ' '), 1) <= array_length(string_to_array(b, ' '), 1) then s := a; l := b; else s := b; l := a; end if;
  f1 := split_part(s, ' ', 1);
  if l like s || ' %' and length(f1) >= 4 and not iconn_generic(f1) then return 'name starts the same ("' || s || '")'; end if;
  return null;
end $$;

-- 3 ---------------------------------------------------------------------------------------------
create or replace function public.iconn_list_matches(p_run_id bigint)
returns table (firm_key text, firm_name text, wi_id text, how text, row_ids bigint[], row_name text)
language sql stable set search_path = public as $$
  with firms as (
    select distinct on (coalesce(nullif(r.norm_name, ''), lower(r.name)))
           coalesce(nullif(r.norm_name, ''), lower(r.name)) as k, r.name, r.people, r.contacts_detail, r.email_domains
      from iconnections_import_rows r join iconnections_import_runs u on u.id = r.run_id and u.import_no = r.import_no
     where r.run_id = p_run_id
     order by coalesce(nullif(r.norm_name, ''), lower(r.name)), r.row_no
  ), rw as (
    select m.id, m.investor_name, m.contact_name,
           coalesce(nullif(m.evidence ->> 'wi_investor_id', ''), substring(m.view_investor_url from 'investors/(-?[0-9]+)$')) as wi
      from wi_mandates m
     where coalesce(nullif(m.evidence ->> 'wi_investor_id', ''), substring(m.view_investor_url from 'investors/(-?[0-9]+)$')) is not null
       -- never a news-headline row
       and coalesce(m.investor_tag, '') !~* 'launch|new manager|market trend|service provider|people move|performance|fundrais|regulat|top story|top insight|managers insight'
       and (coalesce(m.fit_reason, '') || coalesce(m.hard_fail_reasons::text, '')) !~* 'not an investor mandate'
       and coalesce(array_length(regexp_split_to_array(btrim(coalesce(m.investor_name, '')), '\s+'), 1), 0) <= 7
       and coalesce(m.investor_name, '') !~* '\m(posts|hires|hired|taps|tapped|launches|launched|joins|joined|absorbing|debut|names|named|appoints|appointed|unit|record|quarterly|returns|exits|shuts|closes)\M'
  ), people as (
    select f.k, btrim(p) as person from firms f, unnest(coalesce(f.people, '{}'::text[])) p where btrim(coalesce(p, '')) <> ''
    union
    select f.k, btrim(c ->> 'name') from firms f, jsonb_array_elements(coalesce(f.contacts_detail, '[]'::jsonb)) c
     where btrim(coalesce(c ->> 'name', '')) <> ''
  ), doms as (
    select f.k, lower(d) as dom from firms f, unnest(coalesce(f.email_domains, '{}'::text[])) d
  ), cts as (
    select lower(btrim(name)) as n, company, lower(split_part(email, '@', 2)) as dom from contacts
     where nullif(btrim(company), '') is not null
  ), hits as (
    select f.k, rw.wi, iconn_name_rule(f.name, rw.investor_name) as how, rw.id
      from firms f join rw on iconn_name_rule(f.name, rw.investor_name) is not null
    union all
    select pp.k, rw.wi, 'same contact person: ' || pp.person, rw.id
      from people pp join rw on lower(btrim(rw.contact_name)) = lower(pp.person)
    union all
    select pp.k, rw.wi, 'same contact person: ' || pp.person || ' (' || c.company || ')', rw.id
      from people pp join cts c on c.n = lower(pp.person) join rw on iconn_name_rule(c.company, rw.investor_name) is not null
    union all
    select d.k, rw.wi, 'same website: ' || d.dom || ' (' || c.company || ')', rw.id
      from doms d join cts c on c.dom = d.dom and not iconn_free_mail(c.dom)
      join rw on iconn_name_rule(c.company, rw.investor_name) is not null
  )
  select h.k, f.name, h.wi, string_agg(distinct h.how, '; '), array_agg(distinct h.id order by h.id),
         (select m.investor_name from wi_mandates m where m.id = min(h.id))
    from hits h join firms f on f.k = h.k
   group by h.k, f.name, h.wi
$$;

-- 4 ---------------------------------------------------------------------------------------------
create or replace function public.iconn_link_from_list(p_run_id bigint, p_apply boolean default false, p_only text[] default null)
returns jsonb language plpgsql volatile set search_path = public as $$
declare res jsonb; n int := 0; r record;
begin
  create temp table if not exists _iconn_list (firm_key text, firm_name text, wi_id text, how text, row_ids bigint[], row_name text,
                                               linked_wi text, blocked text, n_wi int) on commit drop;
  truncate _iconn_list;
  insert into _iconn_list
  select m.*, f.wi_investor_id,
         case when exists (select 1 from iconn_wi_lookup l where l.firm = m.firm_name and l.confidence = 'Rejected candidate'
                             and l.candidates @> jsonb_build_array(jsonb_build_object('id', m.wi_id)))
                then 'a person rejected this candidate'
              when exists (select 1 from grok_checked c where c.firm_key = m.firm_key and c.checked_by not like 'Grok%'
                             and c.note ilike '%left unlinked%')
                then 'a person decided to leave it unlinked' end,
         count(*) over (partition by m.firm_key)
    from iconn_list_matches(p_run_id) m join grok.iconn_firms f on f.firm_key = m.firm_key;

  if p_apply then
    for r in select * from _iconn_list where linked_wi is null and blocked is null and n_wi = 1
                                         and (p_only is null or firm_key = any (p_only)) loop
      insert into iconn_wi_lookup (run_id, row_no, firm, confidence, candidates, tried)
      select fr.run_id, fr.row_no, r.firm_name, 'Exact',
             jsonb_build_array(jsonb_build_object('id', r.wi_id, 'name', r.row_name, 'source', 'list', 'how', r.how,
                               'rows', to_jsonb(r.row_ids), 'link', 'https://platform.withintelligence.com/explore/investors/' || r.wi_id)),
             array['list']
        from (select r2.run_id, r2.row_no from iconnections_import_rows r2 join iconnections_import_runs u on u.id = r2.run_id and u.import_no = r2.import_no
               where r2.run_id = p_run_id and coalesce(nullif(r2.norm_name, ''), lower(r2.name)) = r.firm_key order by r2.row_no limit 1) fr;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
      values (null, r.firm_name, 'iconnections.link', null, r.wi_id,
              'From my list ' || to_char(now(), 'DD Mon YYYY') || ': ' || r.how || ' (rows ' || array_to_string(r.row_ids, ', ') || ')', r.wi_id);
      n := n + 1;
    end loop;
  end if;

  select jsonb_build_object('apply', p_apply, 'linked_now', n,
    'would_link', coalesce((select jsonb_agg(jsonb_build_object('firm', firm_name, 'wi_id', wi_id, 'row_name', row_name, 'rows', row_ids, 'how', how) order by firm_name)
                              from _iconn_list where linked_wi is null and blocked is null and n_wi = 1 and (p_only is null or firm_key = any (p_only))), '[]'),
    'conflicts', coalesce((select jsonb_agg(jsonb_build_object('firm', firm_name, 'wi_id', wi_id, 'row_name', row_name, 'how', how) order by firm_name, wi_id)
                             from _iconn_list where linked_wi is null and blocked is null and n_wi > 1), '[]'),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('firm', firm_name, 'wi_id', wi_id, 'row_name', row_name, 'why', blocked) order by firm_name)
                           from _iconn_list where linked_wi is null and blocked is not null), '[]'),
    'already_linked_elsewhere', coalesce((select jsonb_agg(jsonb_build_object('firm', firm_name, 'linked', linked_wi, 'list_says', wi_id, 'row_name', row_name))
                                            from _iconn_list where linked_wi is not null and linked_wi <> wi_id), '[]'))
    into res;
  return res;
end $$;
revoke all on function public.iconn_link_from_list(bigint, boolean, text[]) from public;
revoke all on function public.iconn_list_matches(bigint) from public;

-- 6 ---------------------------------------------------------------------------------------------
create or replace view grok.iconn_people as
  select distinct on (coalesce(nullif(r.norm_name, ''), lower(r.name)))
         coalesce(nullif(r.norm_name, ''), lower(r.name)) as firm_key,
         coalesce(r.contacts_detail,
                  (select jsonb_agg(jsonb_build_object('name', p) order by i) from unnest(r.people) with ordinality p(p, i))) as contacts,
         r.email_domains as websites
    from iconnections_import_rows r join iconnections_import_runs u on u.id = r.run_id and u.import_no = r.import_no and u.hidden_at is null
   order by coalesce(nullif(r.norm_name, ''), lower(r.name)), u.last_matched_at desc nulls last, r.run_id desc, r.row_no;
grant usage on schema grok to grok_reader;
grant select on grok.iconn_people to grok_reader;

-- UNDO
--   drop view grok.iconn_people; drop function public.iconn_link_from_list(bigint, boolean, text[]);
--   drop function public.iconn_list_matches(bigint); drop function public.iconn_name_rule(text, text);
--   drop function public.iconn_generic(text); drop function public.iconn_norm(text);
--   re-run schema-18's console_iconnections_match; re-run schema-22 (console_iconn_wi_profiles) and schema-22b (todo);
--   update iconn_wi_lookup set confidence = 'Undone list link' where tried = array['list'];   -- links made from the list (also logged in wi_fill_log); nothing deleted
--   (the two new columns can stay; they are empty until a file is matched again)
