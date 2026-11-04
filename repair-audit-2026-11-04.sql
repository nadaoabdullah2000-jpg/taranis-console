-- =====================================================================
-- Taranis CRM - repair: audit of every open opportunity, 4 Nov 2026
--
-- All 560 rows in play were re-scored with the console's rescore() and
-- scanned for today's patterns (managers as investors, headline names,
-- profile-only rows, paused / dropped allocations). Found and fixed, each
-- a person's verdict (verdict_source manual):
--   #2662 "Startup HF Crestbreak onboards HMI pro" (type "startup hedge
--         fund") Review -> Rejected as manager news. The rule only knew the
--         exact type "hedge fund"; isHedgeFundType (console) and HF_TYPE
--         (WI 01, version ba97a3b1) now cover any hedge-fund type, but not
--         a fund of hedge funds.
--   #1384 McKnight Foundation, #1385 Textron Inc. Master Trust: profile
--         imports (no alert), Matched 0.95 -> Needs data, as Rotary.
--   #261  Baltimore City Fire & Police ERS: templated profile text and one
--         long/short tag, Matched 0.95 -> Review 0.60, as Achmea / StanCERA.
--   #2325 / #2329 "Slovenian multi" -> "Slovenian multi-family office"
--         (the name was the headline's first words; verdict unchanged).
--   #2364 Albacore doo: country SL (Sierra Leone) -> SI (Slovenia; "d.o.o."
--         is the Slovenian company form).
-- No Review row qualified for Matched: the five the rule would promote were
-- all put in Review by a person, for reasons the rule cannot see (#2509
-- paused allocations, #431 a manager dropped, #533 in-house AI, #237 and
-- #409 templated profiles).
-- =====================================================================
update wi_mandates set qualification = 'rejected', new_qualification = 'rejected', new_fit_score = 0, hard_status = 'fail',
  hard_fail_reasons = '["Not an investor mandate - manager news (a startup hedge fund''s hire)"]'::jsonb,
  verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now() where id = 2662;
update wi_mandates set qualification = 'uncertain', new_qualification = 'needs_data', new_fit_score = null,
  verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now() where id in (1384, 1385);
update wi_mandates set qualification = 'uncertain', new_qualification = 'uncertain', new_fit_score = 0.6,
  verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now() where id = 261;
update wi_mandates set investor_name = 'Slovenian multi-family office' where id in (2325, 2329);
update wi_mandates set investor_country = 'SI' where id = 2364;

-- UNDO (values before; none had a person's verdict)
--   update wi_mandates set qualification = 'uncertain', new_qualification = 'uncertain', new_fit_score = 0.6,
--          hard_status = 'uncertain', hard_fail_reasons = '[]'::jsonb,
--          verdict_source = null, verdict_set_by = null, verdict_set_at = null where id = 2662;
--   update wi_mandates set qualification = 'matched', new_qualification = 'matched', new_fit_score = 0.95,
--          verdict_source = null, verdict_set_by = null, verdict_set_at = null where id in (1384, 1385, 261);
--   update wi_mandates set investor_name = 'Slovenian multi' where id in (2325, 2329);
--   update wi_mandates set investor_country = 'SL' where id = 2364;

-- Country codes found while exporting (4 Nov): Korean Teachers' Credit Union
-- was "SO" (Somalia) -> KR; KGI Life Insurance was "TA" (no such code) -> TW.
update wi_mandates set investor_country = 'KR' where id = 2363 and investor_country = 'SO';
update wi_mandates set investor_country = 'TW' where id = 32 and investor_country = 'TA';
-- UNDO: set them back to 'SO' / 'TA'.

-- ---------------------------------------------------------------------
-- Tech review, same day (a person's answers; rows re-scored with the
-- console's rescore() before writing):
--   Tech = No for Bank of Singapore, LSERS, Philos & Partners, Lehigh,
--     NC State (technology only in a generic list of themes) and Loxahatchee
--     Capital (technology mentioned as a concentration risk). Matched rows
--     keep their verdict (they match on long/short or quant); Loxahatchee's
--     two Review rows (#2480, #2495) stood on tech alone -> Needs data.
--   Kaiser Permanente #2384, #2396: "primary investment theme focuses on
--     artificial intelligence" and a $1.5bn hedge-fund programme -> Review 0.60.
--   Stifel, Nicolaus & Co. (5 rows): a broker-dealer -> Rejected, "Not an allocator".
-- ---------------------------------------------------------------------
update wi_mandates set is_tech_investor = false,
  tech_signal = 'Set by a person: research@taranis.net, 2026-11-04 - ' ||
    case when investor_name ilike 'loxahatchee%' then 'technology is mentioned as a concentration risk, not an interest'
         else 'technology only in a generic list of themes, not a technology focus' end
where investor_name ~* '^(bank of singapore|louisiana school employees|philos & partners|lehigh university|north carolina state university|loxahatchee)';
update wi_mandates set qualification = 'uncertain', new_qualification = 'needs_data', new_fit_score = null,
  verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now() where id in (2480, 2495);
update wi_mandates set qualification = 'uncertain', new_qualification = 'uncertain', new_fit_score = 0.6,
  verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now() where id in (2384, 2396);
update wi_mandates set qualification = 'rejected', new_qualification = 'rejected', new_fit_score = 0, hard_status = 'fail',
  hard_fail_reasons = '["Not an allocator - Stifel, Nicolaus & Co. is a broker-dealer, not an investor to raise from"]'::jsonb,
  approved_at = null, approved_by = null,
  verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now() where investor_name ilike 'stifel%';
-- UNDO
--   Tech answers: is_tech_investor back to its enrichment value (true for the five theme-list
--     investors, null for Loxahatchee) and tech_signal back to the enrichment text.
--   #2480, #2495: new_qualification 'uncertain', new_fit_score 0.6, verdict_source null.
--   #2384, #2396: new_qualification 'needs_data', new_fit_score null, verdict_source null.
--   Stifel: #1728, #1767 were needs_data; #1257 rejected 0.10; #1737, #1776 rejected 0.05
--     (verdict_source null on all five).
