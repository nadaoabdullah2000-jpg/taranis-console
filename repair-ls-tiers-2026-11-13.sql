-- 13 Nov 2026, APPLIED (127 rows; approved by research@taranis.net: long/short evidence ranked, not excluded, across the whole book.)
-- Console rule (app.js, merged after this): long/short read from text, a hedge fund intention, or tags; a tag in a
-- long list counts unless the newest hedge fund intention names other strategies only (evidence.newest_intention_criteria).
-- Ranking (lsTier): 1 long/short equity (or quant), 2 equity hedge / a long/short tag in a long list, 3 plain equity in a
-- hedge fund context. Excluded: long-only, market-neutral, 130/30, private equity. 'Quantitative analysis' is not quant.
-- Hire cap lifted only when long/short (hedge fund intention quote) and Tech (quote) both come from the profile.
-- This file: 127 rows.
--   * evidence.equity_long_short stored from the hedge fund intention (incl. POBA tier 1, Citi GW, DUMAC, Mass General Brigham, Bowdoin)
--   * evidence.newest_intention_criteria removed where the newest hedge fund intention does not contradict long/short,
--     set where it names other strategies only (SBP, Colorado Health, Brooks Macdonald, PCAM Blue Chip, ...),
--     kept on SWIB with the basis 'held by research@taranis.net' (tag only, unconfirmed) so it stays in Review
--   * verdict / score from the console's own rescore: into Matched Citi Global Wealth, Bowdoin, DUMAC, Albacore (row 2364),
--     Mass General Brigham; SBP to Review; 108 other moves outside Matched
-- Not touched: manual verdicts, a person's Tech choices, Andrew Carnegie (1358), the 39 rows into/out of Rejected (held),
-- the 13 borderline equity cases (not stored as evidence).
-- ONE transaction. Backup: wi_mandates_backup_20261113_lstiers. Every value logged in wi_fill_log.
begin;
create temp table pl(id bigint primary key, sets jsonb, rem text[], q text, s numeric, curq text) on commit drop;
insert into pl values
(38, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(85, '{}'::jsonb, '{}'::text[], 'low', 0.2, 'needs_data'),
(108, '{}'::jsonb, '{}'::text[], 'low', 0.2, 'needs_data'),
(137, '{"equity_long_short": "\"The firm considers long/short equity hedge funds as the primary area the team is considering for future allocations.\" (hedge fund intention, 2026-08-13)"}'::jsonb, '{}'::text[], 'matched', 1, 'needs_data'),
(146, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(158, '{"equity_long_short": "\"Interested in managers capable of allocating capital across different trading styles and market opportunities, on top of maintaining its exposure to long/short equity strategies.\" (hedge fund intention, 2026-08-10)"}'::jsonb, '{}'::text[], null, null, 'uncertain'),
(172, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(173, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(197, '{"newest_intention_criteria": {"long_short": false, "at": "2026-11-13", "basis": "newest hedge fund intention names other strategies only"}}'::jsonb, '{}'::text[], null, null, 'uncertain'),
(213, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(232, '{"equity_long_short": "\"Strategies include relative value, CTA, macro, fixed income/credit, and equity.\" (hedge fund intention, 2026-07-27)"}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'low'),
(239, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(260, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(262, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(282, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(300, '{}'::jsonb, '{}'::text[], 'low', 0.2, 'needs_data'),
(311, '{"equity_long_short": "\"Strategies: Relative Value, CTA, Digital Assets, Event Driven, Fixed Income/Credit Hedge Funds, Equity Hedge Funds, Macro, and Multi-Strategy.\" (hedge fund intention, 2025-12-01)"}'::jsonb, '{}'::text[], 'matched', 1, 'needs_data'),
(333, '{"equity_long_short": "\"Planning to make new commitments, focusing on macro, multi-strategy, equity hedge and fixed income/credit hedge over the next 12-18 months in North America and Asia.\" (hedge fund intention, 2026-10-06)"}'::jsonb, '{}'::text[], 'matched', 1, 'needs_data'),
(346, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(357, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(358, '{}'::jsonb, array['newest_intention_criteria']::text[], 'uncertain', 0.74, 'uncertain'),
(361, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(364, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(370, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(398, '{"equity_long_short": "\"Strategies of interest include macro, multi-strategy, and equity hedge funds.\" (hedge fund intention, 2026-04-01)"}'::jsonb, '{}'::text[], null, null, 'matched'),
(400, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(403, '{"equity_long_short": "\"Strategies: Relative Value, CTA, Event Driven, Fixed Income/Credit Hedge Funds, Equity Hedge Funds, and Macro.\" (hedge fund intention, 2025-10-02)"}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(411, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(416, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(450, '{}'::jsonb, '{}'::text[], 'uncertain', 0.5, 'needs_data'),
(456, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(458, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(464, '{}'::jsonb, array['newest_intention_criteria']::text[], 'uncertain', 0.74, 'uncertain'),
(477, '{}'::jsonb, array['newest_intention_criteria']::text[], 'uncertain', 0.6, 'uncertain'),
(528, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(531, '{"equity_long_short": "\"The firm is looking at equity hedge funds, with a particular focus on long/short strategies.\" (hedge fund intention, 2025-09-22)"}'::jsonb, array['newest_intention_criteria']::text[], 'uncertain', 0.74, 'needs_data'),
(537, '{}'::jsonb, array['newest_intention_criteria']::text[], 'uncertain', 0.74, 'needs_data'),
(555, '{}'::jsonb, '{}'::text[], 'low', 0.2, 'needs_data'),
(765, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(770, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'uncertain'),
(773, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'low'),
(774, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'uncertain'),
(876, '{}'::jsonb, '{}'::text[], 'uncertain', 0.65, 'low'),
(882, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(888, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(893, '{}'::jsonb, '{}'::text[], 'uncertain', 0.65, 'needs_data'),
(902, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(916, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(938, '{"equity_long_short": "\"Targets multi-strategy, global macro and equity long/short, with a focus on emerging markets and Greater Asia.\" (hedge fund intention, 2026-08-20)"}'::jsonb, array['newest_intention_criteria']::text[], 'uncertain', 0.74, 'needs_data'),
(943, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'uncertain'),
(961, '{"equity_long_short": "\"Strategies include CTA, event driven, fixes income/credit, and equity hedge funds.\" (hedge fund intention, 2026-08-28)"}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'low'),
(1001, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(1174, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(1304, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'low'),
(1310, '{}'::jsonb, array['newest_intention_criteria']::text[], 'uncertain', 0.7, 'needs_data'),
(1324, '{"newest_intention_criteria": {"long_short": false, "at": "2026-11-13", "basis": "held by research@taranis.net: long/short only from a tag in a long list, not confirmed by its intentions"}}'::jsonb, '{}'::text[], null, null, 'uncertain'),
(1353, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'uncertain'),
(1354, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'uncertain'),
(1355, '{}'::jsonb, array['newest_intention_criteria']::text[], 'uncertain', 0.74, 'needs_data'),
(1356, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(1359, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'low'),
(1360, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'low'),
(1361, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'low'),
(1363, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'uncertain'),
(1364, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'low'),
(1365, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'low'),
(1367, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'low'),
(1375, '{"equity_long_short": "\"Planning to invest $100m-$300m across 1-3 new commitments to event driven and equity hedge funds globally over the next 12-18 months.\" (hedge fund intention, 2026-05-12)"}'::jsonb, '{}'::text[], null, null, 'matched'),
(1376, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(1381, '{"equity_long_short": "\"Strategies include relative value, digital assets, event driven, equity, macro, and multi-strategy.\" (hedge fund intention, 2025-12-23)"}'::jsonb, '{}'::text[], null, null, 'matched'),
(1386, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(1388, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(1466, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(1571, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(1621, '{}'::jsonb, array['newest_intention_criteria']::text[], 'uncertain', 0.74, 'needs_data'),
(1878, '{"newest_intention_criteria": {"long_short": false, "at": "2026-11-13", "basis": "newest hedge fund intention names other strategies only"}}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(1895, '{"newest_intention_criteria": {"long_short": false, "at": "2026-11-13", "basis": "newest hedge fund intention names other strategies only"}}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(1907, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(1913, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(1919, '{}'::jsonb, '{}'::text[], 'low', 0.2, 'needs_data'),
(1930, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(1938, '{}'::jsonb, '{}'::text[], 'low', 0.2, 'needs_data'),
(1947, '{}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(2213, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(2288, '{"newest_intention_criteria": {"long_short": false, "at": "2026-11-13", "basis": "held by research@taranis.net: long/short only from a tag in a long list, not confirmed by its intentions"}}'::jsonb, '{}'::text[], null, null, 'uncertain'),
(2291, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'uncertain'),
(2313, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'low'),
(2325, '{}'::jsonb, array['newest_intention_criteria']::text[], 'uncertain', 0.74, 'uncertain'),
(2329, '{}'::jsonb, array['newest_intention_criteria']::text[], 'uncertain', 0.74, 'uncertain'),
(2364, '{}'::jsonb, array['newest_intention_criteria']::text[], 'matched', 0.89, 'uncertain'),
(2386, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(2398, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(2474, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'uncertain'),
(2478, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'low'),
(2491, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(2492, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'uncertain'),
(2493, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'low'),
(2534, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(2536, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(2633, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(2634, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(2673, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'low'),
(2684, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'low'),
(2874, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(2882, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(2884, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'uncertain'),
(2891, '{"equity_long_short": "\"Looking into market-neutral and l/s equity funds amid market volatility.\" (hedge fund intention, 2025-05-31)"}'::jsonb, '{}'::text[], null, null, 'matched'),
(2896, '{"equity_long_short": "\"Planning to make new up to 3 commitments over the next 12-18 months globally, focusing on equity hedge equity. (2026-06-08: DUMAC is seeking quant hedge fund managers, particularly those using tools powered by artificial intelligence.)\" (hedge fund intention, 2026-07-21)"}'::jsonb, '{}'::text[], 'matched', 1, 'needs_data'),
(2900, '{"equity_long_short": "\"Strategies include CTA, macro, multi-strategy, equity hedge fund, event-driven, fixed income/credit hedge funds, and relative value.\" (hedge fund intention, 2026-02-11)"}'::jsonb, '{}'::text[], null, null, 'matched'),
(2901, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(2906, '{}'::jsonb, '{}'::text[], 'uncertain', 0.6, 'uncertain'),
(2914, '{}'::jsonb, '{}'::text[], 'needs_data', null, 'low'),
(2919, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(2934, '{"newest_intention_criteria": {"long_short": false, "at": "2026-11-13", "basis": "newest hedge fund intention names other strategies only"}}'::jsonb, '{}'::text[], 'uncertain', 0.7, 'matched'),
(2936, '{}'::jsonb, '{}'::text[], 'uncertain', 0.6, 'needs_data'),
(2940, '{"equity_long_short": "\"Strategies include relative value, event driven, equity, and fixed income/credit.\" (hedge fund intention, 2025-12-23)"}'::jsonb, '{}'::text[], 'uncertain', 0.74, 'needs_data'),
(2952, '{"equity_long_short": "\"Generally, avoids traditional long/short equity strategies, viewing them as business-oriented rather than portfolio-focused, but expects to add two selective long/short equity funds within the next 2-3 months.\" (hedge fund intention, 2025-09-08)"}'::jsonb, '{}'::text[], null, null, 'uncertain'),
(2954, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(3012, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(3052, '{"equity_long_short": "\"The office is seeking long only strategies and long/short strategies focused in the United States.\" (hedge fund intention, 2026-11-09)"}'::jsonb, '{}'::text[], null, null, 'uncertain'),
(3068, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data'),
(3187, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'low'),
(3236, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'low'),
(3245, '{"equity_long_short": "\"Investing primarily in long/short equity, multi-strategy, event-driven, distressed & stressed credit, and global macro, as part of its directional hedge fund portfolio.\" (hedge fund intention, 2023-12-11)"}'::jsonb, '{}'::text[], null, null, 'uncertain'),
(3247, '{"newest_intention_criteria": {"long_short": false, "at": "2026-11-13", "basis": "newest hedge fund intention names other strategies only"}}'::jsonb, '{}'::text[], 'low', 0.25, 'uncertain'),
(3269, '{"equity_long_short": "\"Eligible strategies include equity long/short, including long-biased strategies, event-driven, and multi-strategy approaches.\" (hedge fund intention, 2026-11-11)"}'::jsonb, '{}'::text[], null, null, 'uncertain'),
(3270, '{}'::jsonb, '{}'::text[], 'low', 0.25, 'needs_data');
create table wi_mandates_backup_20261113_lstiers as
  select m.id, m.qualification, m.new_qualification, m.new_fit_score, m.evidence
    from wi_mandates m join pl using (id);
-- only rows still as the dry run saw them, never a manual verdict, never Andrew Carnegie
create temp table go on commit drop as
  select pl.* from pl join wi_mandates m using (id)
   where coalesce(m.verdict_source,'') <> 'manual' and m.id <> 1358 and coalesce(m.validation_status,'') <> 'merged'
     and m.new_qualification is not distinct from pl.curq;
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'evidence.' || k.key, m.evidence->>k.key, k.value #>> '{}', 'Long/short tiers, 13 Nov 2026 (approved by research@taranis.net)', m.evidence->>'wi_investor_id'
  from wi_mandates m join go using (id), jsonb_each(go.sets) k
union all
select m.id, m.investor_name, 'evidence.' || r, m.evidence->>r, null, 'Long/short tiers, 13 Nov 2026 (approved by research@taranis.net): newest hedge fund intention does not contradict long/short', m.evidence->>'wi_investor_id'
  from wi_mandates m join go using (id), unnest(go.rem) r
union all
select m.id, m.investor_name, 'verdict', m.new_qualification || ' ' || coalesce(m.new_fit_score::text,'-'), go.q || ' ' || coalesce(go.s::text,'-'), 'Long/short tiers, 13 Nov 2026 (approved by research@taranis.net)', m.evidence->>'wi_investor_id'
  from wi_mandates m join go using (id) where go.q is not null;
update wi_mandates m set
  evidence = (coalesce(m.evidence,'{}'::jsonb) - go.rem) || go.sets,
  new_qualification = coalesce(go.q, m.new_qualification),
  new_fit_score = case when go.q is not null then go.s else m.new_fit_score end,
  qualification = case when go.q is null then m.qualification when go.q in ('matched','rejected') then go.q else 'uncertain' end
  from go where go.id = m.id;
select (select count(*) from pl) planned, (select count(*) from go) applied;
commit;
-- UNDO: update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--   new_fit_score = b.new_fit_score, evidence = b.evidence from wi_mandates_backup_20261113_lstiers b where b.id = m.id;
