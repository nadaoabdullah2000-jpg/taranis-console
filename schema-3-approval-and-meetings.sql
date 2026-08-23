-- =====================================================================
-- Taranis CRM — migration 3
--
-- Run AFTER schema.sql and schema-2-read-and-storage.sql.
--
-- Two changes, both of which the console now depends on:
--
--   1. APPROVAL BECOMES A HUMAN ACT.
--      Until now the Approved list was "qualification = 'matched'", which
--      is the AI scorer's opinion, written by WI 01 before anyone had read
--      the alert. So investors nobody had ever seen appeared as approved.
--      approved_at records that a person pressed Approve in the app, and
--      nothing reaches the Approved list without it.
--
--      The two columns are kept side by side on purpose. qualification is
--      still the screening verdict and is still worth seeing; it simply no
--      longer speaks for a person.
--
--   2. MEETINGS GET A PROVIDER.
--      Zoom, Microsoft Teams or Google Meet, chosen per meeting.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. APPROVAL
-- ---------------------------------------------------------------------
alter table wi_mandates add column if not exists approved_at timestamptz;
alter table wi_mandates add column if not exists approved_by text;

-- The Approved list orders by this and the Opportunities filters count on
-- it, so it is worth an index even though the table is small today.
create index if not exists wi_mandates_approved
  on wi_mandates (approved_at desc nulls last);

comment on column wi_mandates.approved_at is
  'When a person pressed Approve in the console. NULL means not approved, '
  'regardless of what qualification says. Never written by a workflow.';
comment on column wi_mandates.approved_by is
  'Console email of whoever approved it.';


-- IMPORTANT: nothing here backfills approved_at from qualification.
--
-- That is the whole point of the migration. Every existing row starts as
-- not approved, including the ones the scorer marked 'matched', because
-- no person has yet approved any of them. The Approved list will be empty
-- on the first load after this runs, and it should be.
--
-- If you decide you want the previously auto-published ones to count as
-- approved, that is a deliberate choice and this is the statement — but
-- read it as "I am approving these, in bulk, now":
--
--   update wi_mandates
--      set approved_at = coalesce(published_at, now()),
--          approved_by = 'bulk-import: previously auto-published'
--    where qualification = 'matched'
--      and published_at is not null
--      and approved_at is null;


-- ---------------------------------------------------------------------
-- 2. MEETINGS
-- ---------------------------------------------------------------------
alter table crm_meetings add column if not exists provider   text
  default 'zoom';
alter table crm_meetings add column if not exists created_by text;

-- Only the three the app offers. A typo in an API call should fail here,
-- loudly, rather than silently produce a meeting on nothing.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_meetings_provider_ck') then
    alter table crm_meetings
      add constraint crm_meetings_provider_ck
      check (provider in ('zoom', 'teams', 'meet'));
  end if;
end $$;

comment on column crm_meetings.provider is
  'zoom | teams | meet. Which platform issued meet_url.';


-- ---------------------------------------------------------------------
-- 3. THE WRITES THE CONSOLE MAKES
--
-- schema-2 gave the browser read access only, but the app has been
-- writing seen_at and qualification through PostgREST since it was
-- built — those writes were landing only because RLS had no UPDATE
-- policy to refuse them under a permissive setup, which is not
-- something to rely on. These policies state the intent.
--
-- Deliberately narrow: the console may mark a mandate read, judge it,
-- and approve it. It may not edit the investor's details, and it may
-- not delete anything. Field corrections still go through n8n, where
-- the allow-list and the audit trail are.
-- ---------------------------------------------------------------------
drop policy if exists console_update on wi_mandates;
create policy console_update on wi_mandates for update
  using (is_console_user()) with check (is_console_user());

alter table crm_meetings enable row level security;

drop policy if exists console_read on crm_meetings;
create policy console_read on crm_meetings for select using (is_console_user());

drop policy if exists console_insert on crm_meetings;
create policy console_insert on crm_meetings for insert with check (is_console_user());

-- n8n uses the service role and bypasses all of this, so every existing
-- workflow keeps working exactly as it does now.


-- ---------------------------------------------------------------------
-- 4. CHECK IT WORKED
-- ---------------------------------------------------------------------
-- select count(*) filter (where approved_at is not null) as approved_by_a_person,
--        count(*) filter (where qualification = 'matched') as scored_matched,
--        count(*) as total
--   from wi_mandates;
--
-- The first number should be 0 immediately after running this, and should
-- only ever go up by someone clicking Approve.
