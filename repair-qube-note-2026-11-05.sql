-- Note 5 Nov 2026: the six "Qube" rows stay unlinked.
--
-- The stored text and the original emails were searched for anything that
-- says which Qube it is ("Qube Research & Technologies", London, a named QRT
-- person; Edmonton / Canada for Qube Investment Management). None of it is
-- there: only the headline and one sub-headline per item. Each item's
-- "View manager" button opens the same With Intelligence manager profile,
-- /explore/managers/2145871672, so the six are one Qube; that profile's name
-- could not be read (With Intelligence token expired). Rows: 1644, 2059,
-- 2107, 2231, 2734, 2749.

with u as (
  update wi_mandates m
     set wi_match_note = 'Qube identity unconfirmed: the alert text does not say which Qube (QRT, London, or Qube Investment Management, Edmonton). Its View manager button opens With Intelligence manager 2145871672.',
         wi_match_checked_at = now()
   where m.id in (1644, 2059, 2107, 2231, 2734, 2749) and m.view_investor_url is null
  returning m.id, m.investor_name, m.wi_match_note)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Note: With Intelligence match', null, wi_match_note, 'Qube check 5 Nov 2026' from u;

-- UNDO
--   update wi_mandates set wi_match_note = null where id in (1644, 2059, 2107, 2231, 2734, 2749);
