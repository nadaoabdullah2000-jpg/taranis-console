-- Past rejections -> I-Connections (6 Nov 2026). ONE transaction. Nothing is deleted.
-- Hides the I-Connections firms whose With Intelligence allocator is already
-- rejected (every row that is not merged), using schema-20's iconn_wi_sync: the
-- firm gets status 'hidden', note 'Rejected via With Intelligence' and the date,
-- and each change is logged in iconn_wi_rejection_log. wi_mandates, verdicts and
-- comments are not touched.
--
-- The list (12 firms, all certain matches; none uncertain):
--   rejected by a person in the app:  Mercer (name, no WI id)
--   rejected by the rule:             Alander Management, Anholt Services (USA),
--     Cambridge Associates, CPP Investment Board (name/alias, no WI id), ICG Advisors,
--     Inlihtan Capital, Karlin Asset Management, Mavrik Corp, Northwestern University,
--     Prelude Capital, PRIMWEST SA
-- To hide only the person's rejections, delete the rule lines below before running.

begin;

select iconn_wi_sync(null, wi_name_key('Mercer'), 'Past rejections 6 Nov 2026', false);                                  -- Mercer (person)
select iconn_wi_sync('2147353355', null, 'Past rejections 6 Nov 2026', false);   -- Alander Management (rule)
select iconn_wi_sync('2147347333', null, 'Past rejections 6 Nov 2026', false);   -- Anholt Services (USA) (rule)
select iconn_wi_sync('2147327624', null, 'Past rejections 6 Nov 2026', false);   -- Cambridge Associates (rule)
select iconn_wi_sync(null, wi_name_key('Canada Pension Plan Investment Board (CPPIB)'), 'Past rejections 6 Nov 2026', false); -- CPP Investment Board (rule)
select iconn_wi_sync('2147324861', null, 'Past rejections 6 Nov 2026', false);   -- ICG Advisors (rule)
select iconn_wi_sync('2147347534', null, 'Past rejections 6 Nov 2026', false);   -- Inlihtan Capital (rule)
select iconn_wi_sync('2147347085', null, 'Past rejections 6 Nov 2026', false);   -- Karlin Asset Management (rule)
select iconn_wi_sync('2147330331', null, 'Past rejections 6 Nov 2026', false);   -- Mavrik Corp (rule)
select iconn_wi_sync('-1439734082', null, 'Past rejections 6 Nov 2026', false);  -- Northwestern University (rule)
select iconn_wi_sync('2147331303', null, 'Past rejections 6 Nov 2026', false);   -- Prelude Capital (rule)
select iconn_wi_sync('2147345604', null, 'Past rejections 6 Nov 2026', false);   -- PRIMWEST SA (rule)

commit;

-- UNDO (one block): show every firm this file hid, and log it.
--   begin;
--   insert into iconn_wi_rejection_log (firm_key, firm_name, wi_investor_id, action, old_status, new_status, detail, by_whom)
--   select firm_key, firm_name, wi_investor_id, 'restored', status, 'restored', 'Undo of the 6 Nov past-rejections file', 'undo'
--     from iconn_wi_rejections where by_whom = 'Past rejections 6 Nov 2026' and status = 'hidden';
--   update iconn_wi_rejections set status = 'restored', restored_at = now(), by_whom = 'undo', updated_at = now()
--    where by_whom = 'Past rejections 6 Nov 2026' and status = 'hidden';
--   commit;
-- One firm only: in the I-Connections tab, Hidden -> Show again.
