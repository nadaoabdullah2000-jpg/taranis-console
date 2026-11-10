-- 11 Nov 2026 (decided by research@taranis.net): row 3052 "Unidentified Hong Kong multi-family office
-- (via CAMRADATA)" showed United Kingdom / London, CAMRADATA's own location. The investor is in Hong
-- Kong (the alert's location): country HK, city blank. ONE transaction. Nothing deleted.
-- Backup: wi_mandates_backup_20261111_3052. Logged in wi_fill_log.

begin;
create table wi_mandates_backup_20261111_3052 as
  select id, investor_country, investor_city, new_qualification, new_fit_score from wi_mandates where id = 3052;
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, f.field, f.old_v, f.new_v,
       'Fix 11 Nov 2026 (decided by research@taranis.net): the investor is in Hong Kong; London was CAMRADATA''s location'
  from wi_mandates m cross join lateral (values ('investor_country', m.investor_country, 'HK'), ('investor_city', m.investor_city, null)) f(field, old_v, new_v)
 where m.id = 3052;
update wi_mandates set investor_country = 'HK', investor_city = null where id = 3052;
commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set investor_country = b.investor_country, investor_city = b.investor_city
--     from wi_mandates_backup_20261111_3052 b where b.id = m.id;
--   commit;
