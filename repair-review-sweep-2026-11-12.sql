-- 12 Nov 2026, APPLIED (approved by research@taranis.net): Review sweep (Tulane and the rest).
-- For Review investors whose stored or live-read With Intelligence profile has a hedge fund intention naming
-- equity (-> evidence.equity_long_short: long/short tick) and/or a tech theme (-> evidence.tech_hf_intention:
-- Tech tier 1; Technology = Yes with the themes line where it was not already quoted or set by a person).
-- Verdict / score from the console's own rescore, only where it moves up (7 investors into Matched; a few
-- Review scores up). Manual verdicts, a person's Tech choices, UBP's Tech, MacArthur's Tech and HUB's equity
-- are left alone; the borderline equity cases (Morgan Creek, Hong Kong MFO, Contra Costa, Carson, Michigan,
-- UW, Sonamu) are not applied.
-- ONE transaction. Backup: wi_mandates_backup_20261112_sweep. Logged in wi_fill_log.
begin;
create temp table sw(id bigint, eq text, tech text, sig text, q text, s numeric, before text) on commit drop;
insert into sw values
(3184,'"Its Cross Shore Discovery fund of hedge funds allocates to emerging long/short equity managers with a minimum of five years'' experience in equity research or portfolio management" (hedge fund intention, 2023-02-23)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(3239,'"Looking for emerging long/short equity managers" (hedge fund intention, 2024-10-31)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(2893,'"The firm is considering hedge fund allocations across long/short equity and quant strategies" (hedge fund intention, 2026-03-18)','"Keen on themes such as AI and it is monitoring opportunities in energy and utilities where managers can identify attractive dislocations" (hedge fund intention, 2026-03-18)',NULL,'matched',1,'uncertain 0.65'),
(1377,'"Planning to make 1-3 new commitment focusing on multi-strategy, relative value, equity strategies over the next 12-18 months, investing $20m-$60m" (hedge fund intention, 2026-08-07)','"Primary investment themes over the next 12-18 months include artificial intelligence, digital infrastructure, energy transition, and financial technology" (hedge fund intention, 2026-08-07)',NULL,'matched',1,'uncertain 0.6'),
(2363,'"The mandate will focus on South Korean listed equities and use equity long/short, event-driven, and multi-strategy investment approaches" (hedge fund intention, 2026-10-21)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(1619,NULL,'"The investor''s primary investment themes over the next 12-18 months include artificial intelligence and financial technology" (hedge fund intention, 2026-05-26)',NULL,NULL,NULL,'uncertain 0.6'),
(2888,'"Strategies of interest are macro, relative value, CTA, multi-strategy, equity, and fixed income" (hedge fund intention, 2026-03-17)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(2102,'"Targets long/short equity, multi-strategy, and low-volatility strategies, favoring boutique/emerging managers over large platforms" (hedge fund intention, 2026-10-08)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(2463,'"Continues to add funds, favoring long/short, event-driven, and multi-strategy offerings" (hedge fund intention, 2026-10-21)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(1357,'"05bn in new commitments to CTA, relative value, multi-strategy, and equity hedge funds globally over the next 12-18 months" (hedge fund intention, 2026-05-12)',NULL,NULL,NULL,0.74,'uncertain 0.55'),
(489,NULL,'"The investor''s primary investment theme over the next 12-18 months focus on artificial intelligence" (hedge fund intention, 2025-09-16)',NULL,NULL,NULL,'uncertain 0.65'),
(2887,'"Interested in sector specialist low-net equity hedge fund strategies as well as new launches in offshore structures" (hedge fund intention, 2023-03-31)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(2507,'"Seeking additional differentiated alpha-oriented strategies across relative value, directional, equity long/short and event-driven strategies" (hedge fund intention, 2026-10-26)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(2950,'"Global strategies: Credit, Equity, Macro, Multi-Strategy" (hedge fund intention, 2025-02-28)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(2508,'"Continues to evaluate systematic equity, global macro, multi-strategy and sector specialist long/short managers as it continues to build out its recently restructured diversifiers sleeve" (hedge fund intention, 2026-10-15)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(3223,'"Equity long/short remains a key focus, particularly managers positioned to exploit the widening gap between winners and losers created by AI-led disruption while maintaining limited market beta" (hedge fund intention, 2026-07-13)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(2955,NULL,'"The investor''s investment themes over the next 12-18 months include digital infrastructure, and security and defense" (hedge fund intention, 2026-05-27)',NULL,NULL,NULL,'uncertain 0.6'),
(87,NULL,'"Primary investment themes focus on artificial intelligence, financial technology, and healthcare and longevity" (hedge fund intention, 2026-08-13)',NULL,NULL,NULL,'uncertain 0.65'),
(101,'"Interested in long/short equity and market-neutral strategies but open to a broad range of strategies" (hedge fund intention, 2025-05-31)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(122,'"Interested in long/short equity and market-neutral strategies but open to a broad range of strategies" (hedge fund intention, 2025-05-31)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(2532,'"Could include multi-strategy, event-driven, and equity long/short strategies" (hedge fund intention, 2026-11-03)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(2928,'"Strategies: Event Driven, Macro, and Equity" (hedge fund intention, 2025-12-01)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(1379,'"Strategies include equity, fixed income/credit, event-driven, multi-strategy, and relative value" (hedge fund intention, 2025-09-09)','"Primary investment themes are energy transition, digital infrastructure, artificial intelligence, healthcare and longevity, security and defence, financial technology, and blockchain" (hedge fund intention, 2025-09-09)',NULL,'matched',1,'uncertain 0.7'),
(2364,'"Focused on Luxembourg-domiciled equity long/short, fund-of-hedge funds (FoHFs), and multi-strategy hedge funds" (hedge fund intention, 2026-10-20)',NULL,NULL,NULL,NULL,'uncertain 0.65'),
(3178,'"Other opportunities such as long/short equity and global macro strategies are considered" (hedge fund intention, 2024-05-31)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(3213,'"Region / Strategy: North America / Credit, Equity, and Multi-Strategy; Global / Equity, and Macro" (hedge fund intention, 2024-11-30)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(3210,'"Planning to make 2-6 new commitments, focusing on relative value, CTA, fixed income/credit, equity, and multi-strategy over the next 12-18 months, investing $100m-$300m in North America, Europe, Asia, and globally" (hedge fund intention, 2026-11-04)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(2977,NULL,'"The investor''s primary investment themes over the next 12-18 months include energy transition, digital infrastructure, financial technology, and artificial intelligence" (hedge fund intention, 2026-11-04)',NULL,NULL,NULL,'uncertain 0.7'),
(3013,NULL,'"The investor''s primary investment themes over the next 12-18 months include energy transition, digital infrastructure, financial technology, and artificial intelligence" (hedge fund intention, 2026-11-04)',NULL,NULL,NULL,'uncertain 0.7'),
(2325,'"Focused on Luxembourg-domiciled equity long/short, fund-of-hedge funds (FoHFs), and multi-strategy hedge funds" (hedge fund intention, 2026-10-20)',NULL,NULL,NULL,NULL,'uncertain 0.65'),
(2939,'"Planning to commit <$25m over the next 12 months, to 1 hedge fund Their top hedge fund strategies, in priority order, are: Multi-Strategy; Credit; Equity" (hedge fund intention, 2023-10-31)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(2237,NULL,'"The investor''s primary investment themes over the next 12-18 months focus on energy transition, digital infrastructure, artificial intelligence, blockchain, and security and defense" (hedge fund intention, 2026-05-13)',NULL,NULL,NULL,'uncertain 0.7'),
(2211,NULL,'"The investor''s primary investment themes over the next 12-18 months focus on energy transition, digital infrastructure, artificial intelligence, blockchain, and security and defense" (hedge fund intention, 2026-05-13)',NULL,NULL,NULL,'uncertain 0.7'),
(2879,NULL,'"The investor''s investment themes over the next 12-18 months include energy transition, artificial intelligence, and security and defense" (hedge fund intention, 2026-04-22)',NULL,NULL,NULL,'uncertain 0.7'),
(2216,NULL,'"The investor''s primary investment themes over the next 12-18 months focus on digital infrastructure, artificial intelligence, healthcare and longevity, financial technology, and security and defense" (hedge fund intention, 2026-10-13)',NULL,NULL,NULL,'uncertain 0.6'),
(935,'"Planning to make 4-6 new commitments, focusing on multi-strategy, macro and equity hedge, over the next 12-18 months, investing $7m-$30m" (hedge fund intention, 2026-08-17)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(140,NULL,'"The investor''s primary investment themes over the next 12-18 months focus on energy transition, artificial intelligence, digital infrastructure, healthcare and longevity, security and defense, and financial technology" (hedge fund intention, 2026-08-10)',NULL,NULL,NULL,'uncertain 0.7'),
(429,'"Strategies include event driven, equity, macro, and multi-strategy" (hedge fund intention, 2026-02-10)','"The investor''s primary investment themes over the next 12-18 months focus on energy transition, sustainability, healthcare and longevity, financial technology, and security and defense" (hedge fund intention, 2026-02-10)','With Intelligence profile (theme line): "The investor''s primary investment themes over the next 12-18 months focus on energy transition, sustainability, healthcare and longevity, financial technology, and security and defense"','matched',1,'uncertain 0.7'),
(2913,NULL,'"The investor''s investment themes over the next 12-18 months include artificial intelligence, energy transition, and security and defense" (hedge fund intention, 2026-06-09)',NULL,NULL,NULL,'uncertain 0.6'),
(997,'"Planning to make new commitments to relative value, macro, multi-strategy, event driven, and equity hedge funds over the next 12-18 months" (hedge fund intention, 2026-08-06)','"The primary investment themes over the next 12-18 months are security and defense, healthcare and longevity, financial technology, and artificial intelligence" (hedge fund intention, 2026-08-06)',NULL,NULL,NULL,'uncertain 0.7'),
(460,'"Planning to make up to 3 new hedge fund commitments focused on equity strategies over the next 12-18 months, investing up to $75m in global funds" (hedge fund intention, 2026-01-16)',NULL,NULL,NULL,0.65,'uncertain 0.6'),
(358,'"Strategies of interest are as follows: Relative value, event driven, credit hedge funds, equity, macro, and multi-strategy" (hedge fund intention, 2026-07-07)',NULL,NULL,NULL,NULL,'uncertain 0.6'),
(197,NULL,'"The investor''s investment themes over the next 12-18 months include energy transition, artificial intelligence, and sustainability" (hedge fund intention, 2026-06-24)',NULL,NULL,NULL,'uncertain 0.6'),
(2632,NULL,'"The investor''s primary investment themes over the next 12-18 months focus on digital infrastructure and artificial intelligence" (hedge fund intention, 2026-02-18)',NULL,NULL,NULL,'uncertain 0.6'),
(815,NULL,'"The investor''s primary investment themes over the next 12-18 months include artificial intelligence, digital infrastructure, energy transition, security and defense, and financial technology" (hedge fund intention, 2026-08-18)',NULL,NULL,NULL,'uncertain 0.6'),
(2930,'"Seeks for equity long/short strategies for developing and emerging markets, mainly looking at Ucits structure" (hedge fund intention, 2024-10-31)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(1218,'"Planning to add up to 10 new commitments focusing on liquid strategies, particularly equity long/short, while considering credit/convertible and global macro strategies over the next 12-18 months" (hedge fund intention, 2026-08-17)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(468,'"Researching Asia, European, and sector-focused equity long/short, systematic, macro, and long/short credit strategies" (hedge fund intention, 2026-08-13)',NULL,NULL,NULL,0.74,'uncertain 0.55'),
(529,'"Planning to make 1-10 new hedge fund commitments, focusing on tax advantaged long short strategy, over the next 12-18 months, investing $1m-$10m in global funds" (hedge fund intention, 2026-02-11)','"The investor''s primary investment theme over the next 12-18 months focuses on financial technology" (hedge fund intention, 2025-08-18)','With Intelligence profile (theme line): "The investor''s primary investment theme over the next 12-18 months focuses on financial technology"','matched',1,'uncertain 0.74'),
(1070,'"Planning to make up to 5 new commitments over the next 12-18 months across equity hedge funds, event driven and multi-strategy, investing up to $250m globally" (hedge fund intention, 2026-08-26)',NULL,NULL,NULL,NULL,'uncertain 0.74'),
(2329,'"Focused on Luxembourg-domiciled equity long/short, fund-of-hedge funds (FoHFs), and multi-strategy hedge funds" (hedge fund intention, 2026-10-20)',NULL,NULL,NULL,NULL,'uncertain 0.65'),
(2218,NULL,'"The investor''s primary investment themes over the next 12-18 months focus on energy transition, digital infrastructure, artificial intelligence, blockchain, and security and defense" (hedge fund intention, 2026-05-13)',NULL,NULL,NULL,'uncertain 0.7'),
(2260,'"Planning to make new commitments over the next 12-18 months across multi-strategy, equity, and event driven strategies" (hedge fund intention, 2026-02-18)','"The investor''s primary investment themes over the next 12-18 months focus on artificial intelligence, and healthcare and longevity" (hedge fund intention, 2026-02-18)',NULL,'matched',1,'uncertain 0.7'),
(2270,'"Planning to make new commitments over the next 12-18 months across multi-strategy, equity, and event driven strategies" (hedge fund intention, 2026-02-18)','"The investor''s primary investment themes over the next 12-18 months focus on artificial intelligence, and healthcare and longevity" (hedge fund intention, 2026-02-18)',NULL,'matched',1,'uncertain 0.7'),
(174,'"Planning to make 1-3 new commitment focusing on multi-strategy, relative value, equity strategies over the next 12-18 months, investing $20m-$60m" (hedge fund intention, 2026-08-07)','"Primary investment themes over the next 12-18 months include artificial intelligence, digital infrastructure, energy transition, and financial technology" (hedge fund intention, 2026-08-07)',NULL,'matched',1,'uncertain 0.7'),
(1362,'"Strategies include CTA, event driven, and equity" (hedge fund intention, 2026-02-23)','"The investor''s primary investment themes over the next 12-18 months focus on digital infrastructure, and security & defense" (hedge fund intention, 2025-12-01)','With Intelligence profile (theme line): "The investor''s primary investment themes over the next 12-18 months focus on digital infrastructure, and security & defense"','matched',1,'uncertain 0.65'),
(412,NULL,'"The investor’s primary investment themes over the next 12-18 months focus on energy transition, artificial intelligence, digital infrastructure, and financial technology" (hedge fund intention, 2025-10-16)','With Intelligence profile (theme line): "The investor’s primary investment themes over the next 12-18 months focus on energy transition, artificial intelligence, digital infrastructure, and financial technology"',NULL,NULL,'uncertain 0.7');
create table wi_mandates_backup_20261112_sweep as
  select m.id, m.qualification, m.new_qualification, m.new_fit_score, m.fit_reason, m.is_tech_investor, m.tech_signal, m.evidence
    from wi_mandates m join sw using (id) where coalesce(m.verdict_source,'') <> 'manual';
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, f.field, f.old, f.new, 'Review sweep, 12 Nov 2026 (approved by research@taranis.net)', m.evidence->>'wi_investor_id'
  from wi_mandates m join sw using (id)
  cross join lateral (values
    ('equity_long_short', m.evidence->>'equity_long_short', sw.eq),
    ('tech_hf_intention', m.evidence->>'tech_hf_intention', sw.tech),
    ('tech_signal', m.tech_signal, sw.sig),
    ('Verdict', sw.before, case when sw.q is not null or sw.s is not null then concat_ws(' ', coalesce(sw.q, m.new_qualification), sw.s) end)) f(field, old, new)
 where coalesce(m.verdict_source,'') <> 'manual' and f.new is not null;
update wi_mandates m set
  evidence = coalesce(m.evidence,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('equity_long_short', sw.eq, 'tech_hf_intention', sw.tech)),
  is_tech_investor = case when sw.sig is not null then true else m.is_tech_investor end,
  tech_signal = coalesce(sw.sig, m.tech_signal),
  new_qualification = coalesce(sw.q, m.new_qualification),
  qualification = case when sw.q = 'matched' then 'matched' else m.qualification end,
  new_fit_score = coalesce(sw.s, m.new_fit_score),
  fit_reason = case when sw.q = 'matched' then 'Long/short and Technology from its hedge fund intention (Review sweep, 12 Nov 2026). ' || coalesce(m.fit_reason,'')
                    else m.fit_reason end
  from sw where sw.id = m.id and coalesce(m.verdict_source,'') <> 'manual';
commit;
-- UNDO: update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--   new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, is_tech_investor = b.is_tech_investor,
--   tech_signal = b.tech_signal, evidence = b.evidence from wi_mandates_backup_20261112_sweep b where b.id = m.id;
