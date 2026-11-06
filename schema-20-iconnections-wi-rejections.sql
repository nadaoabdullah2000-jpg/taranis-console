-- Schema 20 (6 Nov 2026): rejecting an allocator in With Intelligence hides it
-- from the I-Connections tab.
--
-- One way only. Nothing here writes wi_mandates: the I-Connections tab has no
-- verdict of its own, and hiding or showing a firm there never changes the
-- With Intelligence row. Comments (allocator_comments) are not touched either:
-- they belong to the allocator and stay on it.
--
-- Link (iconn_wi_links), the same one the 111 matched I-Connections firms use:
--   1. the With Intelligence id of the allocator row the firm is matched to
--      (iconnections_import_rows.matched_id -> wi_mandates.evidence.wi_investor_id);
--   2. else the With Intelligence search for the firm (iconn_wi_lookup) when it
--      found exactly one exact profile;
--   3. else the name: the matched allocator row's name, when the I-Connections
--      match was exact or a known alias.
-- Uncertain links (a fuzzy name match with no With Intelligence id, or a search
-- that only found a "likely" profile) are never hidden on their own: they are
-- listed as "to check" in the tab, with Hide and Keep buttons.
--
-- An allocator counts as rejected when every one of its rows (by With
-- Intelligence id, else by name) that is not merged is rejected. Rejecting one
-- alert of an investor with several open ones hides nothing.
--
-- Going forward (trigger zz_iconn_wi_sync): when a person rejects in the app
-- (verdict_source = 'manual') and that makes the allocator rejected, its
-- I-Connections firms are hidden at once. When a rejected row is un-rejected,
-- they come back. Every hide, show and restore is logged in
-- iconn_wi_rejection_log; nothing is deleted.

create table if not exists public.iconn_wi_rejections (
  firm_key       text primary key,            -- the I-Connections firm (console_iconnections_run's firm_key)
  firm_name      text not null,
  wi_investor_id text,
  allocator_key  text,                        -- name key, when the allocator has no With Intelligence id
  allocator_name text,
  mandate_ids    bigint[],
  match_how      text not null,               -- 'wi_id' or 'name'
  match_detail   text,
  certain        boolean not null,
  status         text not null check (status in ('hidden', 'to_review', 'kept', 'restored')),
  note           text not null default 'Rejected via With Intelligence',
  rejected_at    timestamptz,                 -- when it was hidden (or listed to check)
  restored_at    timestamptz,
  by_whom        text,
  updated_at     timestamptz not null default now()
);
comment on table public.iconn_wi_rejections is
  'I-Connections firms hidden because their allocator is rejected in With Intelligence (status hidden), or listed to check (to_review). Never deleted: status restored / kept.';

create table if not exists public.iconn_wi_rejection_log (
  id             bigserial primary key,
  firm_key       text not null,
  firm_name      text,
  wi_investor_id text,
  action         text not null,               -- hidden, to_review, restored, kept, hidden_by_person
  old_status     text,
  new_status     text,
  detail         text,
  by_whom        text,
  at             timestamptz not null default now()
);

alter table public.iconn_wi_rejections enable row level security;
alter table public.iconn_wi_rejection_log enable row level security;
drop policy if exists iconn_wi_rej_read on public.iconn_wi_rejections;
drop policy if exists iconn_wi_log_read on public.iconn_wi_rejection_log;
create policy iconn_wi_rej_read on public.iconn_wi_rejections for select using (is_console_user());
create policy iconn_wi_log_read on public.iconn_wi_rejection_log for select using (is_console_user());
grant select on public.iconn_wi_rejections, public.iconn_wi_rejection_log to authenticated;
-- No write grants: only the functions below write these tables.

create or replace function public.wi_name_key(n text) returns text
language sql immutable as $$
  select lower(btrim(regexp_replace(regexp_replace(coalesce(n, ''), '[.,]', '', 'g'), '\s+', ' ', 'g')))
$$;

create or replace function public.wi_row_rejected(nq text, q text, vs text) returns boolean
language sql immutable as $$
  select coalesce(vs, '') <> 'merged'
     and case when nullif(nq, '') is not null then nq = 'rejected' else coalesce(q, '') = 'rejected' end
$$;

-- Every I-Connections firm of the files on the Earlier matches list, with its
-- link to a With Intelligence allocator.
create or replace view public.iconn_wi_links with (security_invoker = true) as
with runs as (
  select id, import_no, last_matched_at from iconnections_import_runs where hidden_at is null
), t as (
  select r.run_id, r.row_no, r.name, r.match_method, r.matched_id, u.last_matched_at,
         coalesce(nullif(r.norm_name, ''), lower(r.name)) as firm_key
    from iconnections_import_rows r join runs u on u.id = r.run_id and r.import_no = u.import_no
), lead as (
  select distinct on (firm_key) firm_key, run_id, name, match_method, matched_id
    from t order by firm_key, last_matched_at desc nulls last, run_id desc, row_no
), rws as (
  select l.firm_key, array_agg(t.row_no) as row_nos
    from lead l join t on t.firm_key = l.firm_key and t.run_id = l.run_id group by l.firm_key
), x as (
  select l.firm_key, l.run_id, l.name as firm_name, l.match_method, l.matched_id,
         nullif(m.evidence ->> 'wi_investor_id', '') as m_wi,
         case when m.id is not null then wi_name_key(m.investor_name) end as m_key,
         m.investor_name as m_name,
         (select k.candidates -> 0 ->> 'id' from iconn_wi_lookup k
           where k.run_id = l.run_id and k.row_no = any(r.row_nos) and k.confidence = 'Exact'
             and jsonb_array_length(k.candidates) = 1 limit 1) as exact_wi,
         (select k.candidates -> 0 ->> 'id' from iconn_wi_lookup k
           where k.run_id = l.run_id and k.row_no = any(r.row_nos) and k.confidence = 'Likely' limit 1) as likely_wi
    from lead l join rws r using (firm_key)
    left join wi_mandates m on m.id = l.matched_id
)
select firm_key, run_id, firm_name, matched_id, m_name as allocator_name,
       coalesce(m_wi, exact_wi, likely_wi) as wi_investor_id,
       case when coalesce(m_wi, exact_wi, likely_wi) is null then m_key end as allocator_key,
       case when coalesce(m_wi, exact_wi, likely_wi) is not null then 'wi_id' else 'name' end as match_how,
       case when m_wi is not null then 'With Intelligence id of the matched allocator row #' || matched_id
                                       || ' (I-Connections ' || coalesce(match_method, '') || ' name match)'
            when exact_wi is not null then 'With Intelligence id: the search found one exact profile'
            when likely_wi is not null then 'With Intelligence search found only a likely profile'
            else 'Name: I-Connections ' || coalesce(match_method, '') || ' match to #' || matched_id
                 || ', which has no With Intelligence id' end as match_detail,
       (m_wi is not null or exact_wi is not null
        or (coalesce(m_wi, exact_wi, likely_wi) is null and match_method in ('exact', 'alias'))) as certain
  from x
 where m_wi is not null or exact_wi is not null or likely_wi is not null or m_key is not null;

-- Is the allocator rejected: every row that is not merged, by With
-- Intelligence id, else by name key among rows without one.
create or replace function public.wi_allocator_state(p_wi text, p_key text)
returns table (rejected boolean, by_person boolean, mandate_ids bigint[], name text, rejected_on timestamptz)
language sql stable set search_path = public as $$
  with m as (
    select id, investor_name, verdict_source, verdict_set_at,
           wi_row_rejected(new_qualification, qualification, validation_status) as rej
      from wi_mandates
     where coalesce(validation_status, '') <> 'merged'
       and case when p_wi is not null then evidence ->> 'wi_investor_id' = p_wi
                else nullif(evidence ->> 'wi_investor_id', '') is null and wi_name_key(investor_name) = p_key end
  )
  select count(*) > 0 and bool_and(rej), coalesce(bool_or(rej and verdict_source = 'manual'), false),
         array_agg(id order by id), (array_agg(investor_name order by id desc))[1],
         max(verdict_set_at) filter (where rej and verdict_source = 'manual')
    from m
$$;

-- Bring the I-Connections side in line with one allocator. Hides its firms
-- when it is rejected (to check, when the link is uncertain), restores them
-- when it is not. Returns the number of firms changed.
create or replace function public.iconn_wi_sync(p_wi text, p_key text, p_by text, p_restore boolean default true)
returns integer language plpgsql security definer set search_path = public as $$
declare
  s record; l record; cur record; n integer := 0; to_status text; had boolean;
begin
  if p_wi is null and coalesce(p_key, '') = '' then return 0; end if;
  select * into s from wi_allocator_state(p_wi, p_key);
  for l in select * from iconn_wi_links
            where (p_wi is not null and wi_investor_id = p_wi)
               or (p_wi is null and wi_investor_id is null and allocator_key = p_key) loop
    select * into cur from iconn_wi_rejections where firm_key = l.firm_key;
    had := found;
    if s.rejected then
      if had and cur.status in ('hidden', 'kept', 'to_review') then continue; end if;
      to_status := case when l.certain then 'hidden' else 'to_review' end;
      insert into iconn_wi_rejections as r (firm_key, firm_name, wi_investor_id, allocator_key, allocator_name,
             mandate_ids, match_how, match_detail, certain, status, rejected_at, restored_at, by_whom, updated_at)
      values (l.firm_key, l.firm_name, l.wi_investor_id, l.allocator_key, coalesce(s.name, l.allocator_name),
              s.mandate_ids, l.match_how, l.match_detail, l.certain, to_status, coalesce(s.rejected_on, now()), null, p_by, now())
      on conflict (firm_key) do update set firm_name = excluded.firm_name, wi_investor_id = excluded.wi_investor_id,
             allocator_key = excluded.allocator_key, allocator_name = excluded.allocator_name,
             mandate_ids = excluded.mandate_ids, match_how = excluded.match_how, match_detail = excluded.match_detail,
             certain = excluded.certain, status = excluded.status, rejected_at = excluded.rejected_at,
             restored_at = null, by_whom = excluded.by_whom, updated_at = now();
      insert into iconn_wi_rejection_log (firm_key, firm_name, wi_investor_id, action, old_status, new_status, detail, by_whom)
      values (l.firm_key, l.firm_name, l.wi_investor_id, to_status, case when had then cur.status end, to_status,
              'Rejected via With Intelligence: ' || coalesce(s.name, '') || ' (rows ' || array_to_string(s.mandate_ids, ', ')
              || '). ' || l.match_detail, p_by);
      n := n + 1;
    elsif p_restore and had and cur.status in ('hidden', 'to_review', 'kept') then
      update iconn_wi_rejections set status = 'restored', restored_at = now(), by_whom = p_by, updated_at = now()
       where firm_key = l.firm_key;
      insert into iconn_wi_rejection_log (firm_key, firm_name, wi_investor_id, action, old_status, new_status, detail, by_whom)
      values (l.firm_key, l.firm_name, l.wi_investor_id, 'restored', cur.status, 'restored',
              'Un-rejected in With Intelligence: ' || coalesce(s.name, ''), p_by);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.iconn_wi_sync(text, text, text, boolean) from public, anon, authenticated;

-- Going forward: a person's rejection in the app hides; an un-rejection restores.
-- Never stops the wi_mandates write: any error here is only a warning.
create or replace function public.iconn_wi_sync_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare was boolean; now_rej boolean; who text;
begin
  was := wi_row_rejected(old.new_qualification, old.qualification, old.validation_status);
  now_rej := wi_row_rejected(new.new_qualification, new.qualification, new.validation_status);
  if was = now_rej then return null; end if;
  if now_rej and coalesce(new.verdict_source, '') <> 'manual' then return null; end if;
  who := coalesce(nullif(auth.jwt() ->> 'email', ''), new.verdict_set_by, 'With Intelligence');
  begin
    perform iconn_wi_sync(nullif(new.evidence ->> 'wi_investor_id', ''),
                          case when nullif(new.evidence ->> 'wi_investor_id', '') is null then wi_name_key(new.investor_name) end,
                          who, not now_rej);
  exception when others then
    raise warning 'I-Connections sync skipped for row %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists zz_iconn_wi_sync on public.wi_mandates;
create trigger zz_iconn_wi_sync after update on public.wi_mandates
  for each row execute function public.iconn_wi_sync_trg();

-- The list before anything is hidden: linked firms whose allocator is rejected.
create or replace function public.console_iconn_wi_preview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_console_user() then raise exception 'Console users only.' using errcode = 'insufficient_privilege'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('firm', l.firm_name, 'firm_key', l.firm_key, 'wi_investor_id', l.wi_investor_id,
             'allocator', s.name, 'mandate_ids', s.mandate_ids, 'match_how', l.match_how, 'match_detail', l.match_detail,
             'certain', l.certain, 'rejected_by_person', s.by_person, 'status', r.status) order by l.certain desc, l.firm_name)
      from iconn_wi_links l
      cross join lateral wi_allocator_state(l.wi_investor_id, l.allocator_key) s
      left join iconn_wi_rejections r on r.firm_key = l.firm_key
     where s.rejected), '[]'::jsonb);
end $$;
grant execute on function public.console_iconn_wi_preview() to authenticated;

-- A person's decision in the I-Connections tab: hide a firm listed to check,
-- keep it, or show a hidden one again. Writes only the I-Connections side.
create or replace function public.console_iconn_wi_set(p_firm_key text, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := lower(coalesce(auth.jwt() ->> 'email', '')); cur record; to_status text;
begin
  if not is_console_user() then raise exception 'Console users only.' using errcode = 'insufficient_privilege'; end if;
  select * into cur from iconn_wi_rejections where firm_key = p_firm_key;
  if not found then raise exception 'No such firm on the With Intelligence rejection list.'; end if;
  to_status := case p_action when 'hide' then 'hidden' when 'show' then 'kept' else null end;
  if to_status is null then raise exception 'Action is hide or show.'; end if;
  update iconn_wi_rejections set status = to_status, by_whom = who, updated_at = now(),
         rejected_at = case when to_status = 'hidden' then now() else rejected_at end
   where firm_key = p_firm_key;
  insert into iconn_wi_rejection_log (firm_key, firm_name, wi_investor_id, action, old_status, new_status, detail, by_whom)
  values (cur.firm_key, cur.firm_name, cur.wi_investor_id, case to_status when 'hidden' then 'hidden_by_person' else 'kept' end,
          cur.status, to_status, 'Set in the I-Connections tab', who);
  return jsonb_build_object('firm_key', p_firm_key, 'status', to_status);
end $$;
grant execute on function public.console_iconn_wi_set(text, text) to authenticated;

-- console_iconnections_run (schema-18) with hidden firms taken out of the list
-- and the counts, and returned on their own ('hidden', 'to_check').
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
           (select array_agg(z.v order by z.o)
              from (select distinct on (lower(regexp_replace(btrim(p.v), '\s+', ' ', 'g'))) p.v, t4.row_no * 1000 + p.i as o
                      from t t4 cross join lateral unnest(t4.people) with ordinality as p(v, i)
                     where t4.firm_key = t.firm_key and btrim(coalesce(p.v, '')) <> ''
                     order by lower(regexp_replace(btrim(p.v), '\s+', ' ', 'g')), t4.row_no * 1000 + p.i) z) as people,
           (select jsonb_agg(distinct c)
              from t t3 cross join lateral jsonb_array_elements(coalesce(t3.conflicts, '[]'::jsonb)) c
             where t3.firm_key = t.firm_key) as conflicts
      from t
     group by t.firm_key
  ),
  f as (
    select firm.firm_key, firm.name, firm.spellings, firm.contacts, firm.row_nos, firm.conflicts, firm.people,
           lead ->> 'bucket' as bucket, lead ->> 'match_method' as match_method,
           (lead ->> 'confidence')::numeric as confidence,
           (lead ->> 'matched_id')::bigint as matched_id, lead ->> 'matched_name' as matched_name,
           lead ->> 'matched_status' as matched_status, nullif(lead -> 'opp_ids', 'null'::jsonb) as opp_ids,
           (lead ->> 'matched_fit')::numeric as matched_fit, lead ->> 'matched_fit_reason' as matched_fit_reason,
           coalesce((lead ->> 'opp_rejected')::int, 0) as opp_rejected,
           nullif(lead -> 'candidates', 'null'::jsonb) as candidates, lead ->> 'domain_check' as domain_check,
           w.status as wi_status, w.note as wi_note, w.rejected_at as wi_rejected_at, w.wi_investor_id as wi_investor_id,
           w.allocator_name as wi_allocator, w.match_detail as wi_match_detail
      from firm left join iconn_wi_rejections w on w.firm_key = firm.firm_key
  ),
  r as (
    select f.*,
           f.bucket = 'matched' and f.opp_rejected > 0
             and f.opp_rejected = jsonb_array_length(coalesce(f.opp_ids, '[]'::jsonb)) as rejected,
           case when f.matched_id is not null
                then array_remove(array_agg(f.name) over (partition by f.matched_id), f.name) end as same_opportunity
      from f
  ),
  v as (select * from r where coalesce(wi_status, '') <> 'hidden')
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
                 'conflicts',  count(*) filter (where conflicts is not null),
                 'hidden',     (select count(*) from r where wi_status = 'hidden')) from v),
    'firms', coalesce((select jsonb_agg(jsonb_build_object(
                 'name', name, 'spellings', spellings, 'contacts', contacts, 'row_nos', row_nos, 'people', people,
                 'bucket', bucket, 'match_method', match_method, 'confidence', confidence,
                 'matched_id', matched_id, 'matched_name', matched_name, 'matched_status', matched_status,
                 'matched_fit', matched_fit, 'matched_fit_reason', matched_fit_reason,
                 'rejected', rejected, 'opp_ids', opp_ids, 'opp_rejected', opp_rejected,
                 'same_opportunity', same_opportunity, 'candidates', candidates, 'conflicts', conflicts,
                 'domain_check', domain_check)
               order by confidence desc nulls last, name) from v), '[]'::jsonb),
    -- Hidden: the allocator is rejected in With Intelligence.
    'hidden', coalesce((select jsonb_agg(jsonb_build_object(
                 'firm_key', firm_key, 'name', name, 'contacts', contacts, 'matched_id', matched_id,
                 'wi_investor_id', wi_investor_id, 'allocator', wi_allocator, 'note', wi_note,
                 'rejected_at', wi_rejected_at, 'match_detail', wi_match_detail) order by wi_rejected_at desc, name)
               from r where wi_status = 'hidden'), '[]'::jsonb),
    -- Uncertain links to a rejected allocator: shown in the list, and here to decide.
    'to_check', coalesce((select jsonb_agg(jsonb_build_object(
                 'firm_key', firm_key, 'name', name, 'contacts', contacts, 'matched_id', matched_id,
                 'wi_investor_id', wi_investor_id, 'allocator', wi_allocator,
                 'rejected_at', wi_rejected_at, 'match_detail', wi_match_detail) order by name)
               from r where wi_status = 'to_review'), '[]'::jsonb)
  ) end
$$;
