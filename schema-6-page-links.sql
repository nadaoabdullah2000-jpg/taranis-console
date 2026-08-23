-- =====================================================================
-- Taranis CRM — migration 6
--
-- Run after migration 5. Lets "View article" open the source PDF at the
-- page a signal was read off, instead of at the cover.
--
-- Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. THE PAGES OF EACH REPORT
--
-- HFN 01 now extracts one string per page rather than one joined blob.
-- The joined text still goes to the summariser, which has no use for page
-- boundaries; this is the copy HFN 02 searches to work out where a signal
-- came from.
--
-- Bounded at 6000 characters per page by the workflow. A newsletter page
-- runs two to four thousand, so that is generous, and it stops one badly
-- encoded PDF writing a megabyte of ligature soup into a row.
-- ---------------------------------------------------------------------
alter table hf_newsletters add column if not exists page_texts jsonb;
alter table hf_newsletters add column if not exists page_count int;

comment on column hf_newsletters.page_texts is
  'One entry per page of the PDF, in order. Used to locate which page an '
  'allocator signal was read off. Not shown to anyone — it is an index.';


-- ---------------------------------------------------------------------
-- 2. WHERE AN OPPORTUNITY CAME FROM, TO THE PAGE
--
-- NULL is the normal and honest value: it means the investor's name could
-- not be found on any page, so no page is claimed. HFN 02 records a page
-- only when the name actually appears on it — a wrong page is worse than
-- page one, because page one is honestly the start of the document while
-- a wrong page looks like the system knows something it does not.
-- ---------------------------------------------------------------------
alter table wi_mandates add column if not exists source_page int;

comment on column wi_mandates.source_page is
  'Page of the source PDF the signal was found on, or NULL if it could '
  'not be located. view_article_url already carries #page=N when set.';


-- ---------------------------------------------------------------------
-- 3. OPTIONAL — GIVE THE REPORTS YOU HAVE ALREADY READ A PAGE INDEX
--
-- Reports summarised before this migration have no page_texts, so their
-- existing opportunities keep a plain link to the PDF. Everything filed
-- from now on gets page links with no action from you.
--
-- To go back over what is already there, run the two statements below.
-- They put every report back in the queue for HFN 01 and clear the
-- opportunities it produced so HFN 02 will read it again.
--
-- Do read the cost first: every report is re-downloaded, re-summarised,
-- and every signal in it costs another model call. On a large archive
-- that is a real OpenAI bill, and the only thing gained is a page number
-- on links you already have. Worth it for a recent, heavily used set;
-- rarely worth it for everything.
--
--   delete from wi_mandates
--    where source_kind = 'report'
--      and approved_at is null;          -- never delete an approved record
--
--   update hf_newsletters
--      set summary_status   = 'pending',
--          summary_attempts = 0,
--          signals_attempts = 0,
--          signals_processed_at = null
--    where page_texts is null;
--
-- Then press "Read Every Filed Report" on HFN 01 until it comes back
-- empty, and "Mine Every Report" on HFN 02 likewise.


-- ---------------------------------------------------------------------
-- 4. CHECK IT WORKED
-- ---------------------------------------------------------------------
-- select n.title,
--        n.page_count,
--        count(m.id)                             as opportunities,
--        count(m.source_page)                    as located_to_a_page
--   from hf_newsletters n
--   left join wi_mandates m on m.source_report_id = n.id
--  where n.summary_status = 'done'
--  group by n.id, n.title, n.page_count
--  order by n.id desc
--  limit 20;
--
-- located_to_a_page will be lower than opportunities, and that is
-- expected: a signal whose investor is named only in a headline or a
-- table image cannot be found in the text layer.
