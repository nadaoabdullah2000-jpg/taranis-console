-- 10 Nov 2026 (asked by research@taranis.net): CDPQ, CPP Investment Board (iConnections) and
-- General Electric Pension Trust (row 399) were marked "Not on WI", but they are major investors.
-- They go back on Grok's to-do list: their "no_profile" entries are dated back 31 days (outside
-- todo's 30-day skip) and the note says why. Nothing deleted. ONE transaction.
-- Backup: grok_checked_backup_20261110.
-- Names to search: "Caisse de dépôt et placement du Québec" / "La Caisse"; "Canada Pension Plan
-- Investment Board" / "CPP Investments"; "GE Pension Trust" / "GE Aerospace" / "General Electric Company".

begin;

create table grok_checked_backup_20261110 as
  select * from grok_checked where id in (708, 868, 874);

update grok_checked
   set checked_at = checked_at - interval '31 days',
       note = left(coalesce(note, '') || ' | Reset 10 Nov 2026 by research@taranis.net: major investor, search again by its full name.', 500)
 where id in (708, 868, 874) and result = 'no_profile';

commit;

-- UNDO (one block):
--   begin;
--   update grok_checked c set checked_at = b.checked_at, note = b.note from grok_checked_backup_20261110 b where b.id = c.id;
--   commit;
