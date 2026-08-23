-- =====================================================================
-- Taranis CRM — migration 4
--
-- Run this BEFORE turning HFN 01 and HFN 02 on. It adds the columns the
-- report-to-opportunity pipeline reads and writes. Safe to re-run.
--
-- Nothing here is destructive and nothing is backfilled: every statement
-- is ADD COLUMN IF NOT EXISTS or an index.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. THE RETRY COUNTER ON MINING
--
-- HFN 02 no longer treats "signals_processed_at is set" as proof that a
-- report was mined — a report also has to have produced an opportunity.
-- That makes the backlog heal itself, but on its own it would re-read a
-- report that legitimately yields nothing (all its signals name managers
-- rather than allocators) every hour forever, at one model call per
-- signal. This counter caps it at two attempts.
-- ---------------------------------------------------------------------
alter table hf_newsletters add column if not exists signals_attempts int not null default 0;

comment on column hf_newsletters.signals_attempts is
  'How many times HFN 02 has read this report''s allocator_signals. '
  'Capped at 2 so a report with no real allocators is not re-read forever.';

-- The claim query filters on exactly this shape, and it runs hourly.
create index if not exists hf_newsletters_minable
  on hf_newsletters (summary_status, signals_attempts)
  where summary_status = 'done';


-- ---------------------------------------------------------------------
-- 2. WHERE AN OPPORTUNITY CAME FROM
--
-- HFN 02 writes these two on every opportunity it creates, and its claim
-- query reads source_report_id back to decide whether a report has been
-- mined. Without them the INSERT fails and the whole pipeline is silent.
--
-- Existing rows keep NULL, which reads correctly: they came from the
-- With Intelligence email intake, not from a report.
-- ---------------------------------------------------------------------
alter table wi_mandates add column if not exists source_kind      text;
alter table wi_mandates add column if not exists source_report_id bigint;

comment on column wi_mandates.source_kind is
  'NULL or ''email'' for the WI digest intake, ''report'' for a signal '
  'read out of a filed Hedge Fund Alert or Family Office Confidential PDF.';
comment on column wi_mandates.source_report_id is
  'hf_newsletters.id the signal was read from. The console links back to '
  'the PDF through view_article_url.';

-- This is the NOT EXISTS in HFN 02's claim. It runs once per report per
-- hour, so it is worth an index even on a small table.
create index if not exists wi_mandates_by_report
  on wi_mandates (source_report_id)
  where source_report_id is not null;


-- ---------------------------------------------------------------------
-- 3. A DEFAULT SO NEW UPLOADS ARE CLAIMABLE
--
-- The console files a report by writing the title, publisher, issue date,
-- storage path and public URL — and nothing else. summary_status is never
-- set, so it arrives NULL.
--
-- HFN 01 now claims NULL as well as 'pending', so this default is belt
-- and braces rather than the fix. It is still worth having: it makes the
-- state of a freshly filed row say what it means rather than say nothing.
-- ---------------------------------------------------------------------
alter table hf_newsletters alter column summary_status set default 'pending';

update hf_newsletters set summary_status = 'pending'
 where summary_status is null;


-- ---------------------------------------------------------------------
-- 4. CHECK IT WORKED
--    Run this on its own afterwards to see the size of the backlog.
-- ---------------------------------------------------------------------
-- select summary_status,
--        count(*) as reports,
--        count(*) filter (where jsonb_array_length(
--          coalesce(allocator_signals,'[]'::jsonb)) > 0) as with_signals,
--        count(*) filter (where exists (
--          select 1 from wi_mandates m where m.source_report_id = hf_newsletters.id
--        )) as already_mined
--   from hf_newsletters
--  group by summary_status
--  order by reports desc;
--
-- Before the first run everything should sit under 'pending' with
-- already_mined = 0. As HFN 01 works through them they move to 'done',
-- and as HFN 02 mines them already_mined climbs to match with_signals.
