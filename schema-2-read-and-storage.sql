-- =====================================================================
-- Taranis CRM — migration 2
--
-- Run this AFTER schema.sql. It does two things:
--   1. Lets the console read the data that already exists, so Contacts,
--      Opportunities, Documents and Network show live rows without
--      waiting for the n8n gateway to be built.
--   2. Creates the documents bucket the upload tab writes into.
--
-- READ ONLY. Nothing here lets the browser change a contact, a mandate
-- or an email. Every write still goes through n8n, where the workflow
-- logic and the audit trail live.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. READ ACCESS TO THE EXISTING TABLES
--
-- Turning RLS on is what makes the anon key in the page harmless: with
-- no matching policy, it returns nothing at all. is_console_user() was
-- created in schema.sql and checks the signed-in email against the
-- console_users allow list.
--
-- If any of these tables does not exist on your instance, delete that
-- block and run the rest.
-- ---------------------------------------------------------------------
alter table contacts              enable row level security;
alter table crm_emails            enable row level security;
alter table wi_mandates           enable row level security;
alter table documents             enable row level security;
alter table linkedin_connections  enable row level security;
alter table intelligence_emails   enable row level security;

drop policy if exists console_read on contacts;
create policy console_read on contacts for select using (is_console_user());

drop policy if exists console_read on crm_emails;
create policy console_read on crm_emails for select using (is_console_user());

drop policy if exists console_read on wi_mandates;
create policy console_read on wi_mandates for select using (is_console_user());

drop policy if exists console_read on documents;
create policy console_read on documents for select using (is_console_user());

drop policy if exists console_read on linkedin_connections;
create policy console_read on linkedin_connections for select using (is_console_user());

drop policy if exists console_read on intelligence_emails;
create policy console_read on intelligence_emails for select using (is_console_user());

-- IMPORTANT: n8n connects with the service role, which bypasses RLS
-- entirely. Every existing workflow keeps working exactly as it does
-- now. These policies only govern the browser.


-- ---------------------------------------------------------------------
-- 2. THE DOCUMENTS BUCKET
--
-- Public, because the point of the archive is a link you can put in an
-- email to an investor. Anyone who guesses a path can read a file, so
-- nothing confidential goes in here — decks and published reports only.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', true, 52428800)      -- 50 MB
on conflict (id) do update set public = true, file_size_limit = 52428800;

-- Reading is open, because the links are meant to be shared.
drop policy if exists documents_public_read on storage.objects;
create policy documents_public_read on storage.objects for select
  using (bucket_id = 'documents');

-- Writing is not. Only someone on the allow list can put a file here.
drop policy if exists documents_console_write on storage.objects;
create policy documents_console_write on storage.objects for insert
  with check (bucket_id = 'documents' and is_console_user());

-- No updates and no deletes from the browser at all. A deck that has
-- gone out to investors should be superseded by a new version, never
-- quietly overwritten or removed — that is what version_label is for.


-- ---------------------------------------------------------------------
-- 3. COLUMNS THE UPLOAD TAB WRITES
--    Added only if they are missing, so this is safe to re-run.
-- ---------------------------------------------------------------------
alter table documents add column if not exists storage_path text;
alter table documents add column if not exists filename     text;
alter table documents add column if not exists size_bytes   bigint;
alter table documents add column if not exists mime         text;
alter table documents add column if not exists uploaded_by  text;

create index if not exists documents_current
  on documents (doc_key, period_date desc) where is_current;


-- ---------------------------------------------------------------------
-- 4. CHECK IT WORKED
--    Run this on its own afterwards. Every row should say true.
-- ---------------------------------------------------------------------
-- select tablename, rowsecurity as rls_on
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in ('contacts','crm_emails','wi_mandates','documents',
--                     'linkedin_connections','intelligence_emails');
