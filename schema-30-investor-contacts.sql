-- schema-30 (12 Nov 2026). Applied 12 Nov 2026 (approved by research@taranis.net) as migrations
-- schema_30_investor_contacts and schema_30b_investor_contacts_read_only.
-- Firm details and contacts that Grok reads from With Intelligence profiles (the Grok fill
-- workbook), shown in the iConnections section of the investor card. iconn_firm_name and
-- iconn_profile_url are read from iConnections, the rest from With Intelligence.
--
-- * wi_investor_contacts: one 'firm' row per investor (website, firm LinkedIn, general email,
--   phone, address, other names, read status) and one 'person' row per contact. Keyed by the
--   With Intelligence id; for an investor without one, by the console row (mandate_id).
--   Nothing here touches wi_mandates: no verdict, score or field changes.
-- * Soft delete only (deleted_at). A load writes a load_batch so one load can be undone
--   by stamping deleted_at on that batch.
-- * console_investor_iconn(): what the card shows, in one call: the iConnections links
--   (iconn_wi_links, rejected/hidden ones left out), the iConnections contact names we hold,
--   and the rows above.
--
-- UNDO (if applied and not wanted):
--   revoke all on public.wi_investor_contacts from authenticated;
--   drop function if exists public.console_investor_iconn(text, bigint);
--   alter table public.wi_investor_contacts rename to wi_investor_contacts_unused_20261112;
--   (renamed, not dropped, so no data is lost)

begin;

create table if not exists public.wi_investor_contacts (
  id               bigint generated always as identity primary key,
  kind             text   not null check (kind in ('firm', 'person')),
  wi_investor_id   text,                       -- With Intelligence id (null only when the investor has none)
  mandate_id       bigint references public.wi_mandates(id),  -- the console row, for investors without an id
  investor_name    text   not null,
  -- firm row
  name_on_profile  text,
  website          text,
  firm_linkedin    text,
  general_email    text,
  address          text,
  other_names      text,
  iconn_firm_name  text,                       -- the firm's name as iConnections shows it (Grok)
  read_status      text check (read_status in ('read', 'not found', 'blocked')),
  read_on          date,
  -- person row
  contact_name     text,
  title            text,
  email            text,
  linkedin         text,
  location         text,
  -- both
  iconn_profile_url text,                      -- iConnections profile: the firm's (firm row) or the person's (person row)
  phone            text,
  notes            text,
  source           text   not null default 'With Intelligence and iConnections profiles, read by Grok',
  load_batch       text   not null,             -- e.g. 'grok-fill-2026-11-12'
  loaded_at        timestamptz not null default now(),
  loaded_by        text,
  deleted_at       timestamptz,
  constraint wi_investor_contacts_key check (wi_investor_id is not null or mandate_id is not null),
  constraint wi_investor_contacts_person check (kind <> 'person' or contact_name is not null)
);
create index if not exists wi_investor_contacts_wi on public.wi_investor_contacts (wi_investor_id) where deleted_at is null;
create index if not exists wi_investor_contacts_mid on public.wi_investor_contacts (mandate_id) where deleted_at is null;
-- one live firm row per investor
create unique index if not exists wi_investor_contacts_one_firm
  on public.wi_investor_contacts (coalesce(wi_investor_id, 'row' || mandate_id))
  where kind = 'firm' and deleted_at is null;

alter table public.wi_investor_contacts enable row level security;
drop policy if exists wi_investor_contacts_read on public.wi_investor_contacts;
create policy wi_investor_contacts_read on public.wi_investor_contacts for select using (is_console_user());
grant select on public.wi_investor_contacts to authenticated;
-- Supabase's default privileges also give authenticated write grants on a new table: take them back.
revoke insert, update, delete, truncate on public.wi_investor_contacts from authenticated, anon;
revoke all on public.wi_investor_contacts from anon;
-- No write grants: loads run as reviewed SQL (dry run, one transaction, log, undo file).

-- The card's iConnections section, in one call.
create or replace function public.console_investor_iconn(p_wi text, p_mandate bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_console_user() then raise exception 'Console users only.' using errcode = 'insufficient_privilege'; end if;
  return jsonb_build_object(
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('firm', l.firm_name, 'how', l.match_how, 'detail', l.match_detail,
               'certain', l.certain,
               'people', (select jsonb_agg(distinct e ->> 'name')
                            from iconnections_import_rows r
                            cross join lateral jsonb_array_elements(case when jsonb_typeof(r.contacts_detail) = 'array'
                                                                       then r.contacts_detail else '[]' end) e
                           where r.run_id = l.run_id
                             and coalesce(nullif(r.norm_name, ''), lower(r.name)) = l.firm_key
                             and coalesce(e ->> 'name', '') <> ''))
             order by l.certain desc, l.firm_name)
        from iconn_wi_links l
       where nullif(p_wi, '') is not null and l.wi_investor_id = p_wi
         and not exists (select 1 from iconn_wi_rejections x
                          where x.firm_key = l.firm_key and x.status in ('rejected', 'hidden'))), '[]'::jsonb),
    'firm', (
      select to_jsonb(c) - 'deleted_at' from wi_investor_contacts c
       where c.kind = 'firm' and c.deleted_at is null
         and ((nullif(p_wi, '') is not null and c.wi_investor_id = p_wi)
              or (nullif(p_wi, '') is null and c.mandate_id = p_mandate))
       order by c.loaded_at desc limit 1),
    'people', coalesce((
      select jsonb_agg(to_jsonb(c) - 'deleted_at' order by c.id) from wi_investor_contacts c
       where c.kind = 'person' and c.deleted_at is null
         and ((nullif(p_wi, '') is not null and c.wi_investor_id = p_wi)
              or (nullif(p_wi, '') is null and c.mandate_id = p_mandate))), '[]'::jsonb));
end $$;
revoke all on function public.console_investor_iconn(text, bigint) from public;
grant execute on function public.console_investor_iconn(text, bigint) to authenticated;

commit;
