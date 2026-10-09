-- Schema 12: evidence without the parts the lists never use.
--
-- The list views (Opportunities, Rejected, Find, Ask) read a mandate's
-- evidence only to score it, and the rule (sigText / evidenceText in app.js)
-- already ignores the PDF passage, the report title, the page and WI's
-- profile summary. evidence_scored returns evidence without those keys, so a
-- list can select `evidence:evidence_scored` and leave about 0.3 MB of text
-- behind. It is a read-only computed column (PostgREST calls it like a
-- column); nothing is stored and nothing is changed. Full rows (the mandate
-- page, Fill a gap, To validate) still read evidence itself.

create or replace function public.evidence_scored(w public.wi_mandates)
returns jsonb
language sql stable
as $$
  select case when jsonb_typeof(w.evidence) = 'object'
              then w.evidence - 'passage' - 'from_report' - 'page' - 'wi_summary'
              else w.evidence end
$$;
