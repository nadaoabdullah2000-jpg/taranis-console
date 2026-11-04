-- =====================================================================
-- Taranis CRM - repair: Mirabaud Asset Management is a manager
--
-- #391 "Mirabaud" and #392 "Mirabaud Asset Management (MAM)" were in
-- Matched (0.90 / 0.95) on "eyes l/s, global macro for $1.7bn FoHF".
-- Mirabaud is an asset manager (it runs the Haussmann fund of hedge funds,
-- #258), so all three are rejected as a person's decision (verdict_source
-- manual, kept by wi_keep_manual_verdict). The reason starts "Not an
-- allocator", so entityRejected keeps the investor out of Opportunities.
-- #391/#392 now share one name; #392's organization_name had been a
-- headline fragment ("Looking at long/short equity and global").
-- Mirabaud is also in the console's KNOWN_MANAGERS and WI 01's
-- RAISES_CAPITAL (version e2b8c859), so new alerts are rejected on arrival.
-- Applied live on 4 Nov 2026.
-- =====================================================================
update wi_mandates set
  qualification = 'rejected', new_qualification = 'rejected', new_fit_score = 0, hard_status = 'fail',
  hard_fail_reasons = '["Not an allocator - Mirabaud Asset Management is an asset manager (it runs the Haussmann fund of hedge funds), not an investor to raise from"]'::jsonb,
  approved_at = null, approved_by = null,
  verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now()
where id in (258, 391, 392);
update wi_mandates set investor_name = 'Mirabaud Asset Management (MAM)', organization_name = 'Mirabaud Asset Management'
where id in (391, 392);

-- UNDO (values before; none had a person's verdict, none approved)
--   update wi_mandates set qualification = 'uncertain', new_qualification = 'needs_data', new_fit_score = null,
--          hard_fail_reasons = '["Asset class excludes hedge funds"]'::jsonb,
--          verdict_source = null, verdict_set_by = null, verdict_set_at = null where id = 258;
--   update wi_mandates set qualification = 'matched', new_qualification = 'matched', new_fit_score = 0.90,
--          investor_name = 'Mirabaud', organization_name = 'Mirabaud',
--          hard_fail_reasons = '["Failed parse: no country, type or asset class"]'::jsonb,
--          verdict_source = null, verdict_set_by = null, verdict_set_at = null where id = 391;
--   update wi_mandates set qualification = 'matched', new_qualification = 'matched', new_fit_score = 0.95,
--          organization_name = 'Looking at long/short equity and global',
--          hard_fail_reasons = '["Failed parse: no country, type or asset class"]'::jsonb,
--          verdict_source = null, verdict_set_by = null, verdict_set_at = null where id = 392;
--   (hard_status was not recorded before; it is display-only.)

-- ---------------------------------------------------------------------
-- Same day, also checked from the Matched list (a person's verdict each):
--   #2509 Montgomery County (Md.) ERS (MCERP): matched 0.95 on "interested in
--         quantitative", but the alert says it is not adding long/short
--         equity and opportunistic allocations are paused -> Review, 0.60.
--         (#2477, the same 27 Oct alert, stays Needs data under the card.)
--   #1369 The Rotary Foundation of Rotary International: a profile from an
--         investor data export (no alert, no intention), matched 0.95 on the
--         strategies its profile lists -> Needs data until an alert says
--         what it wants now.
-- ---------------------------------------------------------------------
update wi_mandates set qualification = 'uncertain', new_qualification = 'uncertain', new_fit_score = 0.6,
  verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now() where id = 2509;
update wi_mandates set qualification = 'uncertain', new_qualification = 'needs_data', new_fit_score = null,
  verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now() where id = 1369;
-- UNDO
--   update wi_mandates set qualification = 'uncertain', new_qualification = 'matched', new_fit_score = 0.95,
--          verdict_source = null, verdict_set_by = null, verdict_set_at = null where id = 2509;
--   update wi_mandates set qualification = 'matched', new_qualification = 'matched', new_fit_score = 0.95,
--          verdict_source = null, verdict_set_by = null, verdict_set_at = null where id = 1369;
