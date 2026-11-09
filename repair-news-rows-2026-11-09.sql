-- 9 Nov 2026: rows 3006 and 3007 are news headlines, not allocators
-- ("JonesTrading takes on pedigreed trader", "First NY absorbing TCM trading team").
-- Rejected as a person's decision (research@taranis.net). ONE transaction. Nothing deleted.
-- Backup: wi_mandates_backup_20261109_news. Logged in wi_fill_log (source 'News headline 9 Nov 2026').

begin;

create table wi_mandates_backup_20261109_news as
  select id, qualification, new_qualification, new_fit_score, fit_reason, verdict_source, verdict_set_by,
         verdict_set_at, approved_at, approved_by
    from wi_mandates where id in (3006, 3007);

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Verdict', coalesce(new_qualification, qualification), 'rejected',
       'News headline 9 Nov 2026: not an investor mandate (decided by research@taranis.net)'
  from wi_mandates where id in (3006, 3007);

update wi_mandates
   set qualification = 'rejected', new_qualification = 'rejected', new_fit_score = 0,
       fit_reason = 'Not an investor mandate: a news headline, not an allocator.',
       verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now(),
       approved_at = null, approved_by = null
 where id in (3006, 3007);

commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--          new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, verdict_source = b.verdict_source,
--          verdict_set_by = b.verdict_set_by, verdict_set_at = now(), approved_at = b.approved_at, approved_by = b.approved_by
--     from wi_mandates_backup_20261109_news b where b.id = m.id;
--   commit;
-- (verdict_set_at must change for the manual-verdict guard to accept the restore.)
