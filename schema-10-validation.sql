-- =====================================================================
-- Taranis CRM — migration 10
--
-- Human validation for investors read out of reports (HFN). A report is
-- the least-trusted source, so a mandate taken from one waits in the
-- console's "To validate" queue until someone confirms it.
--
--   validation_status  null              not from a report; nothing to validate
--                      pending           waiting in the queue, kept out of
--                                        Matched / Waiting, Opportunities, Find,
--                                        Rejected and the Ask agent
--                      confirmed         a person confirmed it; the normal
--                                        re-score places it like any other row
--                      not_an_allocator  a person rejected it
--   validated_by / validated_at          who decided, and when
--
-- report_leads (prospects named in a report with no mandate) carry the same
-- three columns, and console users may now update them so the queue's
-- buttons can record a decision. They could only read them before.
--
-- Safe to run more than once.
-- =====================================================================

alter table public.wi_mandates
  add column if not exists validation_status text,
  add column if not exists validated_by text,
  add column if not exists validated_at timestamptz;

alter table public.report_leads
  add column if not exists validation_status text default 'pending',
  add column if not exists validated_by text,
  add column if not exists validated_at timestamptz;

do $$ begin
  alter table public.wi_mandates add constraint wi_mandates_validation_status_check
    check (validation_status in ('pending', 'confirmed', 'not_an_allocator'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.report_leads add constraint report_leads_validation_status_check
    check (validation_status in ('pending', 'confirmed', 'not_an_allocator'));
exception when duplicate_object then null; end $$;

create index if not exists wi_mandates_validation_pending
  on public.wi_mandates (id) where validation_status = 'pending';

drop policy if exists console_update on public.report_leads;
create policy console_update on public.report_leads for update
  using (is_console_user()) with check (is_console_user());

-- Every report row already stored waits for a person.
update public.wi_mandates set validation_status = 'pending'
 where source_kind = 'report' and validation_status is null;
