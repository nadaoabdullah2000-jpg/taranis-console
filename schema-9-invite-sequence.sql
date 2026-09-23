-- =====================================================================
-- Taranis CRM — migration 9
--
-- Remembers the SEQUENCE of the last calendar invitation sent for a
-- meeting. Every invitation for a meeting carries the same UID; the
-- create-meeting Edge Function sends SEQUENCE 0 the first time and one
-- higher on every resend ("Send an email" again, "Issue the link"), so
-- calendars update the event they already have instead of adding another.
--
-- Null means no invitation has been sent yet. Google Meet meetings are not
-- counted here: Google keeps its own event's sequence.
--
-- Safe to run more than once.
-- =====================================================================

alter table public.crm_meetings
  add column if not exists ics_sequence integer;
