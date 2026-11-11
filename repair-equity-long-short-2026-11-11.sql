-- 11 Nov 2026, APPROVED by research@taranis.net: equity in a hedge-fund context counts toward long/short.
-- Rule: within a hedge-fund intention or a hedge-fund asset class, "equity", "equity hedge", "equity long/short",
-- "equity l/s" or "fundamental equity" counts toward long/short; never long-only, listed/public equity without
-- hedge-fund context, private equity or equity market-neutral. Whether it may make a MATCH (the user's adjustments):
--   * an intention quote (evidence.equity_long_short) or the user's decision: may match (Hilton, Pathstone, Norway GPFG, Commonfund);
--   * an "equity" tag where hedge funds are the only asset class and there is no long-only tag: may match (Maihar);
--   * a tag beside other asset classes or a long-only tag (Okabena, Smithsonian, Kentucky PPA, Illinois TRS, Deutsche Bank PB,
--     GCM Grosvenor), or a fund vehicle (PCAM Blue Chip / Select, evidence.equity_review_only): Review only, 74% at most.
--   * not counted (evidence.equity_not_long_short): HUB Retirement, Sanlam, AlphaBee, Bayshore, Opima, Stable Asset Management (3),
--     Kristal (user decision). Their verdicts are not changed.
-- Final Matched from this change (5): Maihar Capital Strategies, The Norwegian Government Pension Fund Global (GPFG), Commonfund (CF), Conrad N. Hilton Foundation, Pathstone Family Office LLC.
-- Verdicts are the console's rescore with the rule (app, PR). A person's verdict is never changed.
-- ONE transaction. Backup: wi_mandates_backup_20261111_equity_ls. Logged in wi_fill_log.
begin;
create table wi_mandates_backup_20261111_equity_ls as
  select id, qualification, new_qualification, new_fit_score, fit_reason, evidence from wi_mandates where id in (87,214,342,393,412,465,771,1173,1218,1312,1877,1878,1894,1895,1920,1939,2313,2673,2684,2710,2887,2897,2924,2925,2931,2933,2947,2950,2951,2956,3201);
create temp table eq_in(id bigint, q text, s numeric, mark jsonb) on commit drop;
insert into eq_in values
  (342, 'uncertain', 0.65, '{}'),
  (393, 'uncertain', 0.74, '{}'),
  (465, 'uncertain', 0.74, '{}'),
  (771, 'uncertain', 0.74, '{}'),
  (1218, 'uncertain', 0.74, '{"equity_long_short": "\"liquid strategies, particularly equity long/short\" (Aug 2026)"}'),
  (1312, 'matched', 1, '{}'),
  (1877, 'uncertain', 0.74, '{"equity_review_only": "Fund vehicle (PCAM): Review at most (user decision)"}'),
  (1878, 'uncertain', 0.74, '{"equity_review_only": "Fund vehicle (PCAM): Review at most (user decision)"}'),
  (1894, 'uncertain', 0.74, '{"equity_review_only": "Fund vehicle (PCAM): Review at most (user decision)"}'),
  (1895, 'uncertain', 0.74, '{"equity_review_only": "Fund vehicle (PCAM): Review at most (user decision)"}'),
  (1920, 'uncertain', 0.74, '{}'),
  (1939, 'uncertain', 0.74, '{}'),
  (2887, 'uncertain', 0.74, '{"equity_long_short": "\"sector specialist low-net equity hedge fund strategies\" (Mar 2023)"}'),
  (2897, 'matched', 0.9, '{"equity_long_short": "\"allocated $250m via SMA to CapeView Capital ... European equity long/short\" (Sep 2026)"}'),
  (2925, 'uncertain', 0.74, '{}'),
  (2931, 'matched', 0.9, '{"equity_long_short": "Decided by research@taranis.net (11 Nov 2026)"}'),
  (2933, 'uncertain', 0.74, '{}'),
  (2947, 'matched', 1, '{"equity_long_short": "\"Strategies: Relative Value, Event Driven, Fixed Income/Credit, Equity, and Multi-Strategy\" (Sep 2025)"}'),
  (2950, 'uncertain', 0.74, '{"equity_long_short": "\"Global strategies: Credit, Equity, Macro, Multi-Strategy\" (Feb 2025)"}'),
  (2951, 'matched', 1, '{"equity_long_short": "\"event-driven, multi-strategy, fixed income/credit, and equity hedge funds\" (May 2026)"}'),
  (2956, 'uncertain', 0.74, '{}'),
  (3201, 'uncertain', 0.74, '{}');
create temp table eq_out(id bigint, why text) on commit drop;
insert into eq_out values
  (87, 'Equities & Fixed Income globally: not clearly hedge-fund long/short (user decision)'),
  (214, '"relative value and market-neutral equities" (Mar 2024): market-neutral, not long/short'),
  (412, 'its equity is "up to 30 new public equity commitments" (Aug 2025): long-only public equity'),
  (1173, '"hedge funds within a mature public markets portfolio alongside long-only" (Aug 2026): equity is the long-only book'),
  (2313, 'a manager: "The manager runs a CEO-driven long/short equity strategy" (its own fund)'),
  (2673, 'a manager: "The manager runs a CEO-driven long/short equity strategy" (its own fund)'),
  (2684, 'a manager: "The manager runs a CEO-driven long/short equity strategy" (its own fund)'),
  (2710, '"tax-aware equities" (Oct 2026): long-only'),
  (2924, '"emphasizing derivatives over equities", market-neutral (Apr 2025)');

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'Verdict', concat_ws(' ', m.new_qualification, coalesce(m.new_fit_score::text, '-')),
       e.q || ' ' || coalesce(e.s::text, '-') || ' (long/short: equity in a hedge-fund context' || coalesce('; ' || nullif(e.mark::text, '{}'), '') || ')',
       'Equity counts as long/short, 11 Nov 2026 (approved by research@taranis.net)', m.evidence ->> 'wi_investor_id'
  from wi_mandates m join eq_in e on e.id = m.id where coalesce(m.verdict_source, '') <> 'manual';
update wi_mandates m set new_qualification = e.q, qualification = case when e.q in ('matched','rejected') then e.q else 'uncertain' end,
       new_fit_score = e.s,
       fit_reason = 'Long/short from equity in a hedge-fund context (11 Nov 2026)' || case when e.q = 'matched' then '' else ', Review only' end || '. ' || coalesce(m.fit_reason, ''),
       evidence = (case when jsonb_typeof(m.evidence) = 'object' then m.evidence else '{}'::jsonb end) || e.mark
  from eq_in e where e.id = m.id and coalesce(m.verdict_source, '') <> 'manual';

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'equity_not_long_short', null, o.why,
       'Equity counts as long/short, 11 Nov 2026 (approved by research@taranis.net): not counted for this row', m.evidence ->> 'wi_investor_id'
  from wi_mandates m join eq_out o on o.id = m.id;
update wi_mandates m set evidence = (case when jsonb_typeof(m.evidence) = 'object' then m.evidence else '{}'::jsonb end)
       || jsonb_build_object('equity_not_long_short', 'Checked 11 Nov 2026 (live profile): ' || o.why)
  from eq_out o where o.id = m.id;
commit;
-- UNDO: update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--   new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, evidence = b.evidence
--   from wi_mandates_backup_20261111_equity_ls b where b.id = m.id;
