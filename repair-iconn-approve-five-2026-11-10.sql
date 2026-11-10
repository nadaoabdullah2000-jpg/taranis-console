-- 10 Nov 2026 (decided by research@taranis.net): the 5 uncertain I-Connections links Grok had read and
-- accepted are approved as certain links, in iconn_approved_links (no re-import can undo them).
-- ONE transaction. Nothing deleted. Logged in wi_fill_log.
--   Altus Investment            -> Altus Investment Management (2147332370)
--   Riva Capital                -> RIVA Capital (2147326202)
--   Trinity Wall Street         -> Trinity Wall Street Church (2147317189)
--   Truist                      -> Truist Financial Corporation (2147316836)
--   UBS Unified Global Alts HF  -> UBS Hedge Fund Solutions (2147319031)

begin;
insert into iconn_approved_links (firm_key, wi_investor_id, row_id, why, approved_by) values
  ('altus investment', '2147332370', null, 'Approved 10 Nov 2026: Grok read and accepted Altus Investment Management', 'research@taranis.net'),
  ('riva capital', '2147326202', null, 'Approved 10 Nov 2026: Grok read and accepted RIVA Capital', 'research@taranis.net'),
  ('trinity wall street', '2147317189', null, 'Approved 10 Nov 2026: Grok read and accepted Trinity Wall Street Church', 'research@taranis.net'),
  ('truist', '2147316836', null, 'Approved 10 Nov 2026: Grok read and accepted Truist Financial Corporation', 'research@taranis.net'),
  ('ubs unified global alternatives hedge funds', '2147319031', null, 'Approved 10 Nov 2026: Grok read and accepted UBS Hedge Fund Solutions', 'research@taranis.net')
on conflict (firm_key) do nothing;
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id, source)
select null, a.firm_key, 'iconnections.approved_link', 'likely', a.wi_investor_id, a.wi_investor_id,
       'Approved link 10 Nov 2026 (research@taranis.net): ' || a.why
  from iconn_approved_links a
 where a.firm_key in ('altus investment', 'riva capital', 'trinity wall street', 'truist', 'ubs unified global alternatives hedge funds');
commit;

-- UNDO: update iconn_approved_links set revoked_at = now()
--        where firm_key in ('altus investment', 'riva capital', 'trinity wall street', 'truist', 'ubs unified global alternatives hedge funds');
