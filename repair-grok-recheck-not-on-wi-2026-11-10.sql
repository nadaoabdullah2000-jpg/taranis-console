-- 10 Nov 2026 (asked by research@taranis.net): the 45 I-Connections firms Grok marked "not on With
-- Intelligence" go back on Grok's list, to be searched by name and by their contact people. Before
-- this, the list check (iconn_list_matches: name, acronym, contact person, website) found none of
-- them in the user's list. Their "no_profile" entries are dated back 31 days (outside todo's 30-day
-- skip) and the note says why. Nothing deleted. ONE transaction.
-- Not reset: the 4 firms the user decided on (Altegris, JP Morgan, Blackstone, M4invest).
-- Backup: grok_checked_backup_20261110_notonwi.

begin;
create table grok_checked_backup_20261110_notonwi as
  select * from grok_checked where id in (852,853,855,856,857,858,859,862,863,865,866,869,870,872,873,875,876,877,878,879,880,
    882,884,885,886,888,889,891,893,896,897,898,899,900,901,902,903,904,905,906,907,911,912,913,915);
update grok_checked
   set checked_at = checked_at - interval '31 days',
       note = left(coalesce(note, '') || ' | Reset 10 Nov 2026 by research@taranis.net: search again by name and contact people.', 500)
 where id in (select id from grok_checked_backup_20261110_notonwi) and result = 'no_profile' and checked_by = 'Grok';
commit;

-- UNDO (one block):
--   begin;
--   update grok_checked c set checked_at = b.checked_at, note = b.note from grok_checked_backup_20261110_notonwi b where b.id = c.id;
--   commit;
