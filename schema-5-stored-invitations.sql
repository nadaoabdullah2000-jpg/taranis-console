-- =====================================================================
-- Taranis CRM — migration 5
--
-- Run after migration 4. One change: the written invitation is kept with
-- the meeting instead of existing only in the browser tab that booked it.
--
-- Safe to re-run. Nothing is backfilled — meetings booked before this
-- simply have no stored invitation, and the app says so rather than
-- inventing one after the fact. Rebooking is not required; the text can
-- be rebuilt by pressing "Issue the link" on a row that has none.
-- =====================================================================

alter table crm_meetings add column if not exists invitation_subject  text;
alter table crm_meetings add column if not exists invitation_body     text;
alter table crm_meetings add column if not exists invitation_language text;

comment on column crm_meetings.invitation_body is
  'The invitation exactly as CRM 10 v2 composed it and exactly as anyone '
  'on the guest list received it. Written by the workflow only — the '
  'console reads it, edits a copy in the browser, and never writes back.';
comment on column crm_meetings.invitation_language is
  'en or fr. Which language the stored invitation was written in.';


-- ---------------------------------------------------------------------
-- WHY THERE IS NO NEW POLICY HERE
--
-- The console can already read crm_meetings through console_read, so the
-- stored invitation is visible to it the moment the workflow writes it.
--
-- It deliberately gets no write path. crm_meetings already carries
-- meetings_amend, whose WITH CHECK restricts browser updates to rows
-- ending at status 'pending' or 'cancelled' — a scheduled meeting is
-- locked against tampering from a page anyone can read the source of.
-- That rule is worth keeping.
--
-- So editing an invitation in the app edits a copy held in the browser,
-- for you to copy and send yourself. The stored text stays as the record
-- of what actually went out, which is the version worth being able to
-- trust when somebody asks what they were sent.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- CHECK IT WORKED
-- ---------------------------------------------------------------------
-- select id, title, status, provider, invitation_language,
--        left(coalesce(invitation_body, '(none stored)'), 60) as invitation
--   from crm_meetings
--  order by start_utc desc
--  limit 10;
