-- 11 Nov 2026 (DRAFT until research@taranis.net approves): equity in a hedge-fund context counts toward long/short.
-- Rule (the user's): within a hedge-fund intention or a hedge-fund asset class, a strategy of "equity", "equity hedge",
-- "equity long/short", "equity l/s" or "fundamental equity" counts; never long-only, listed/public equity without
-- hedge-fund context, private equity, or equity market-neutral. Audit of every open row (496): 31 gain the tick, all
-- from an "equity" strategy tag with Hedge Funds among the asset classes; the 25 With Intelligence profiles were read
-- live (11 Nov 2026) to check each one.
--   A (6 rows): a hedge-fund intention confirms it (the quote is kept in evidence.equity_long_short, shown, not scored).
--   B (17 rows): the tag rule applies; nothing on the profile contradicts it.
--   C (8 rows): the profile says the equity is long-only / public, market-neutral, or the firm is a manager: NOT counted;
--               evidence.equity_not_long_short records why, so the tag never counts for them; verdict unchanged.
-- Verdicts for A and B are the console's rescore with the rule. A person's verdict is never changed.
-- ONE transaction. Backup: wi_mandates_backup_20261111_equity_ls. Logged in wi_fill_log.
begin;
create table wi_mandates_backup_20261111_equity_ls as
  select id, qualification, new_qualification, new_fit_score, fit_reason, evidence from wi_mandates
   where id in (2313,2924,2947,2956,2950,1878,1895,1877,3201,214,2925,2684,2933,2887,771,2897,87,2673,1894,1173,2951,2931,342,1920,1939,2710,1218,412,1312,393,465);
create temp table eq_in(id bigint, q text, s numeric, grp text, quote text) on commit drop;
insert into eq_in values
  (2947, 'matched', 1, 'A', '"Strategies: Relative Value, Event Driven, Fixed Income/Credit, Equity, and Multi-Strategy" (Sep 2025)'),
  (2956, 'matched', 1, 'B', null),
  (2950, 'uncertain', 0.74, 'A', '"Global strategies: Credit, Equity, Macro, Multi-Strategy" (Feb 2025)'),
  (1878, 'uncertain', 0.74, 'B', null),
  (1895, 'uncertain', 0.74, 'B', null),
  (1877, 'uncertain', 0.74, 'B', null),
  (3201, 'uncertain', 0.74, 'B', null),
  (2925, 'uncertain', 0.74, 'B', null),
  (2933, 'uncertain', 0.74, 'B', null),
  (2887, 'uncertain', 0.74, 'A', '"sector specialist low-net equity hedge fund strategies" (Mar 2023)'),
  (771, 'uncertain', 0.74, 'B', null),
  (2897, 'matched', 0.9, 'A', '"allocated $250m via SMA to CapeView Capital ... European equity long/short" (Sep 2026)'),
  (87, 'matched', 1, 'B', null),
  (1894, 'uncertain', 0.74, 'B', null),
  (2951, 'matched', 1, 'A', '"event-driven, multi-strategy, fixed income/credit, and equity hedge funds" (May 2026)'),
  (2931, 'matched', 0.9, 'B', null),
  (342, 'uncertain', 0.65, 'B', null),
  (1920, 'uncertain', 0.74, 'B', null),
  (1939, 'uncertain', 0.74, 'B', null),
  (1218, 'uncertain', 0.74, 'A', '"liquid strategies, particularly equity long/short" (Aug 2026)'),
  (1312, 'matched', 1, 'B', null),
  (393, 'uncertain', 0.74, 'B', null),
  (465, 'uncertain', 0.74, 'B', null);
create temp table eq_out(id bigint, why text) on commit drop;
insert into eq_out values
  (2313, 'a manager: "The manager runs a CEO-driven long/short equity strategy" (its own fund)'),
  (2924, '"emphasizing derivatives over equities", market-neutral (Apr 2025)'),
  (214, '"relative value and market-neutral equities" (Mar 2024): market-neutral, not long/short'),
  (2684, 'a manager: "The manager runs a CEO-driven long/short equity strategy" (its own fund)'),
  (2673, 'a manager: "The manager runs a CEO-driven long/short equity strategy" (its own fund)'),
  (1173, '"hedge funds within a mature public markets portfolio alongside long-only" (Aug 2026): equity is the long-only book'),
  (2710, '"tax-aware equities" (Oct 2026): long-only'),
  (412, 'its equity is "up to 30 new public equity commitments" (Aug 2025): long-only public equity');

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'Verdict', concat_ws(' ', m.new_qualification, coalesce(m.new_fit_score::text, '-')),
       e.q || ' ' || coalesce(e.s::text, '-') || ' (long/short: equity in a hedge-fund context' || coalesce(', ' || e.quote, '') || ')',
       'Equity counts as long/short, 11 Nov 2026 (approved by research@taranis.net)', m.evidence ->> 'wi_investor_id'
  from wi_mandates m join eq_in e on e.id = m.id where coalesce(m.verdict_source, '') <> 'manual';
update wi_mandates m set new_qualification = e.q, qualification = case when e.q in ('matched','rejected') then e.q else 'uncertain' end,
       new_fit_score = e.s,
       fit_reason = 'Long/short from equity in a hedge-fund context (11 Nov 2026). ' || coalesce(m.fit_reason, ''),
       evidence = case when e.quote is null then m.evidence
                       else (case when jsonb_typeof(m.evidence) = 'object' then m.evidence else '{}'::jsonb end)
                            || jsonb_build_object('equity_long_short', 'With Intelligence intention: ' || e.quote) end
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
