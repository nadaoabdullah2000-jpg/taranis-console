-- =====================================================================
-- Taranis Console — tables the app needs on top of what already exists.
--
-- Nothing here touches contacts, crm_emails, wi_mandates, documents,
-- linkedin_connections or group_message_queue. Those stay exactly as the
-- workflows left them. This adds the layer Telegram used to provide:
-- who is allowed in, what is waiting for them, and what they did.
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
