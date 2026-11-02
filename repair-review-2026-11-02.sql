-- =====================================================================
-- Taranis CRM — repair: three live rows found in the 2 Nov 2026 review
--
--   #2277  "Wellington bolsters global macro team with" - Wellington hiring
--          a BlueCrest PM: a manager's own news, still in play as Low fit
--          (no WI category, so no rule caught it).
--   #2183  "Israeli LPs after l/s equity" - a trend among Israeli LPs, no
--          single investor to approach, in Matched at 0.90.
--   #2046 / #2049 / #2113 - the investor is Missouri LAGERS; the headline's
--          "eyeing CTA" had been taken into the name. Verdict unchanged.
--
-- Applied live on 2 Nov 2026. None had a person's verdict.
-- =====================================================================
update wi_mandates set new_qualification = 'rejected', new_fit_score = 0, qualification = 'rejected', hard_status = 'fail',
  hard_fail_reasons = '["Not an investor mandate - manager news (Wellington hiring a BlueCrest PM for its global macro team)"]'::jsonb
 where id = 2277 and verdict_source is null;
update wi_mandates set new_qualification = 'rejected', new_fit_score = 0, qualification = 'rejected', hard_status = 'fail',
  hard_fail_reasons = '["Not an investor mandate - a trend among Israeli LPs, no single investor named"]'::jsonb
 where id = 2183 and verdict_source is null;
update wi_mandates set investor_name = 'Missouri LAGERS', organization_name = 'Missouri LAGERS'
 where id in (2046, 2049, 2113) and investor_name = 'Missouri LAGERS eyeing CTA';

-- UNDO (values before; all had hard_status 'uncertain' and hard_fail_reasons [])
--   update wi_mandates set qualification = 'uncertain', new_qualification = 'low', new_fit_score = 0.2,
--          hard_status = 'uncertain', hard_fail_reasons = '[]'::jsonb where id = 2277;
--   update wi_mandates set qualification = 'matched', new_qualification = 'matched', new_fit_score = 0.9,
--          hard_status = 'uncertain', hard_fail_reasons = '[]'::jsonb where id = 2183;
--   update wi_mandates set investor_name = 'Missouri LAGERS eyeing CTA', organization_name = 'Missouri LAGERS eyeing CTA'
--    where id in (2046, 2049, 2113);
