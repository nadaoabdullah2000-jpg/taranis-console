-- 11 Nov 2026 (decided by research@taranis.net): Matched investors whose Technology was recorded
-- "not stated" by Grok before the tightened rule (all checks 07:52-08:48, the rule changed after 09:19)
-- go back on Grok's focus list to be checked under the strict rule. Only the Technology check record is
-- removed (focus_checks.tech); no value, verdict or other field changes.
-- 50 South, AARP, Crewcial, Fairfax Police, Georgia Tech Foundation, Iowa PERS, KTCU, MartinWright,
-- Morgan Stanley AIP, Nationwide.
-- ONE transaction. Nothing deleted. Backup: wi_mandates_backup_20261111_techrecheck. Logged in wi_fill_log.

begin;
create table wi_mandates_backup_20261111_techrecheck as
  select id, focus_checks from wi_mandates
   where evidence ->> 'wi_investor_id' in ('2147318702', '2147326330', '2147330961', '1037201550', '1700', '1825',
                                           '2147273087', '2147355470', '2147318911', '2147351460')
     and focus_checks ? 'tech';
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select m.id, m.investor_name, 'focus.tech', (m.focus_checks -> 'tech')::text, null,
       'Re-check 11 Nov 2026 (decided by research@taranis.net): Technology "not stated" was recorded under the old rule'
  from wi_mandates m join wi_mandates_backup_20261111_techrecheck b using (id);
update wi_mandates m set focus_checks = nullif(m.focus_checks - 'tech', '{}'::jsonb)
  from wi_mandates_backup_20261111_techrecheck b where b.id = m.id;
commit;

-- UNDO:
--   update wi_mandates m set focus_checks = b.focus_checks from wi_mandates_backup_20261111_techrecheck b where b.id = m.id;
