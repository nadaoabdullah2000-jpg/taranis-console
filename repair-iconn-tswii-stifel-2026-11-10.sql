-- 10 Nov 2026 (decided by research@taranis.net). ONE transaction. Nothing deleted.
--  * TSWII: Grok's candidate approved as a certain link to the TSW II fund-of-funds profile
--    (2147330984; contact Kate Nevin and website tswii.com match). Recorded in iconn_approved_links,
--    so no re-import can undo it; its unsure entry is marked reviewed.
--  * Stifel: linked from the list (2147326049, "Stifel, Nicolaus & Co.") but no profile is stored;
--    Grok's 09:35 check ("0 investor profiles" by name) kept it off todo. That entry is dated back
--    31 days, with a hint to open the linked profile directly.
-- Backup: grok_checked_backup_20261110_tswii. Logged in wi_fill_log.

begin;
create table grok_checked_backup_20261110_tswii as
  select * from grok_checked where (firm_key = 'tswii' and result = 'unsure' and reviewed_at is null)
                                or (firm_key = 'stifel' and result = 'no_profile');

insert into iconn_approved_links (firm_key, wi_investor_id, row_id, why, approved_by)
values ('tswii', '2147330984', null, 'Grok candidate approved 10 Nov 2026: TSW II fund of funds; contact Kate Nevin and website tswii.com match', 'research@taranis.net')
on conflict (firm_key) do nothing;
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id, source)
values (null, 'TSWII', 'iconnections.approved_link', 'candidate', '2147330984', '2147330984',
        'Approved link 10 Nov 2026 (research@taranis.net): TSW II fund of funds; Kate Nevin and tswii.com match');
update grok_checked set reviewed_at = now(), reviewed_by = 'research@taranis.net'
 where firm_key = 'tswii' and result = 'unsure' and reviewed_at is null;

update grok_checked
   set checked_at = checked_at - interval '31 days',
       note = left(coalesce(note, '') || ' | Reset 10 Nov 2026 by research@taranis.net: open the linked profile 2147326049 directly.', 500)
 where firm_key = 'stifel' and result = 'no_profile';
insert into iconn_grok_hints (firm_key, hint, set_by)
values ('stifel', 'Link confirmed from the list: open https://platform.withintelligence.com/explore/investors/2147326049 ("Stifel, Nicolaus & Co.") directly and read its profile; a name search does not find it.', 'research@taranis.net')
on conflict (firm_key) do update set hint = excluded.hint, set_by = excluded.set_by, set_at = now();
commit;

-- UNDO (one block):
--   begin;
--   update iconn_approved_links set revoked_at = now() where firm_key = 'tswii';
--   update grok_checked c set checked_at = b.checked_at, note = b.note, reviewed_at = b.reviewed_at, reviewed_by = b.reviewed_by
--     from grok_checked_backup_20261110_tswii b where b.id = c.id;
--   update iconn_grok_hints set hint = '(withdrawn) ' || hint where firm_key = 'stifel';
--   commit;
