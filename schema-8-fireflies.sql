-- =====================================================================
-- Taranis CRM — migration 8
--
-- Records whether the Fireflies notetaker was invited to a meeting, so the
-- console can show "Fireflies: on / off" against each one.
--
-- The create-meeting Edge Function sets it to true only after Fred's
-- invitation has actually been sent (the "Add Fireflies notetaker"
-- checkbox, off by default). Every existing meeting reads as false, which
-- is accurate: the console never invited Fireflies before this.
--
-- Safe to run more than once.
-- =====================================================================

alter table public.crm_meetings
  add column if not exists fireflies boolean not null default false;
