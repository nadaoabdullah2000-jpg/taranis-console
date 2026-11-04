-- =====================================================================
-- Taranis CRM - repair: Bradesco Asset Management (BRAM) is a manager;
-- the last Haussmann Fund row (Mirabaud's fund) follows the 4 Nov ruling
--
-- #381, #446 "Bradesco Asset Management (BRAM)" were in Matched (0.90) on
-- its own fund of hedge funds weighing macro, RV and long/short managers;
-- #382 "Bradesco Explorer Frontier" (Needs data) is BRAM's fund of funds.
-- All three rejected as a person's decision ("Not an allocator", so the
-- investor stays out of Opportunities); #382/#446 organization_name fixed
-- (#382 had a headline fragment). #257 "Haussmann Fund" (Matched 0.95) is
-- the Mirabaud fund missed by repair-mirabaud-2026-11-04.sql; rejected the
-- same way. "bradesco asset management", "BRAM" and "haussmann fund" join
-- the console's KNOWN_MANAGERS and WI 01's RAISES_CAPITAL (version
-- 0d99fb66); plain "Bradesco" is not listed, so its pension and insurance
-- arms are still read as allocators. Applied live on 4 Nov 2026.
-- =====================================================================
update wi_mandates set
  qualification = 'rejected', new_qualification = 'rejected', new_fit_score = 0, hard_status = 'fail',
  hard_fail_reasons = '["Not an allocator - Bradesco Asset Management (BRAM) is an asset manager (its funds of hedge funds, incl. Bradesco Explorer Frontier, are its own products), not an investor to raise from"]'::jsonb,
  approved_at = null, approved_by = null,
  verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now()
where id in (381, 382, 446);
update wi_mandates set organization_name = 'Bradesco Asset Management (BRAM)' where id in (382, 446);
update wi_mandates set
  qualification = 'rejected', new_qualification = 'rejected', new_fit_score = 0, hard_status = 'fail',
  hard_fail_reasons = '["Not an allocator - Mirabaud Asset Management is an asset manager (it runs the Haussmann fund of hedge funds), not an investor to raise from"]'::jsonb,
  approved_at = null, approved_by = null,
  verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now()
where id = 257;

-- UNDO (values before; none had a person's verdict, none approved)
--   update wi_mandates set qualification = 'matched', new_qualification = 'matched', new_fit_score = 0.90,
--          hard_fail_reasons = '["Failed parse: no country, type or asset class"]'::jsonb,
--          verdict_source = null, verdict_set_by = null, verdict_set_at = null where id in (381, 446);
--   update wi_mandates set organization_name = 'Bradesco' where id = 446;
--   update wi_mandates set qualification = 'uncertain', new_qualification = 'needs_data', new_fit_score = null,
--          organization_name = 'While Bradesco typically',
--          hard_fail_reasons = '["Failed parse: no country, type or asset class"]'::jsonb,
--          verdict_source = null, verdict_set_by = null, verdict_set_at = null where id = 382;
--   update wi_mandates set qualification = 'matched', new_qualification = 'matched', new_fit_score = 0.95,
--          verdict_source = null, verdict_set_by = null, verdict_set_at = null where id = 257;
--          (#257's earlier hard_fail_reasons were not recorded.)
