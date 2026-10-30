-- =====================================================================
-- Taranis CRM — repair: Hedge Fund Alert items scored as investors
--
-- "Ex-analyst to debut small-cap fund" (Enstatite Capital launching its
-- long/short equity strategy, Daily Manager Intel, 29 Oct 2026) reached
-- Matched as #2563: WI 01's screen treated Shutter, Manager information
-- and untyped People items as manager news, but not Hedge Fund Alert, so
-- the item was scored on the fund's own strategy. WI 01 (Apply Taranis
-- Hard Criteria, version cd95c59b) and the console's isManagerNews now
-- read a Hedge Fund Alert item as manager news unless it has an investor
-- type or speaks of placing money (allocate, commit, search for, manager
-- search, seed).
--
-- Applied live on 30 Oct 2026 to the 11 rows the corrected rule rejects.
-- Kept: Soros Fund Management x3 (typed family office) and #2313 Stable
-- (a seeder). None of the 11 had a person's verdict (verdict_source null).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. WHAT WAS CHANGED
-- ---------------------------------------------------------------------
update wi_mandates
   set new_qualification = 'rejected', new_fit_score = 0, qualification = 'rejected', hard_status = 'fail',
       hard_fail_reasons = '["Not an investor mandate - manager news (WI filed it under Hedge Fund Alert)"]'::jsonb
 where id in (2087,2145,2146,2315,2316,2521,2522,2523,2555,2556,2563)
   and investor_tag = 'Hedge Fund Alert' and verdict_source is null and coalesce(btrim(investor_type), '') = '';

-- ---------------------------------------------------------------------
-- 2. UNDO (the values before; all had hard_fail_reasons [] and
--    hard_status 'uncertain')
-- ---------------------------------------------------------------------
--   update wi_mandates set qualification = 'uncertain', new_qualification = 'needs_data', new_fit_score = null,
--          hard_status = 'uncertain', hard_fail_reasons = '[]'::jsonb
--    where id in (2087,2145,2146,2315,2316,2521,2522,2523,2555,2556);
--   update wi_mandates set qualification = 'matched', new_qualification = 'matched', new_fit_score = 0.9,
--          hard_status = 'uncertain', hard_fail_reasons = '[]'::jsonb
--    where id = 2563;
