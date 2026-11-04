-- Repair 4 Nov 2026: add the I-Connections firms matched on With Intelligence
-- (75 exact name matches + 17 recommended options, approved by the user) to
-- Opportunities / Rejected with their With Intelligence link and profile data
-- (staged in iconn_wi_profiles / wi_space_reads), scored with the Taranis rule
-- (Space criterion; verdict and reason computed by the console's own rule).
-- Then link each firm in the I-Connections run (run 5) to its new allocator.
-- record_key 'iconn-wi-<With Intelligence id>'; source_kind 'import'.
drop table if exists pick;
create temp table pick (row_no int, wi_id text, conf numeric, nq text, ns numeric, reason text, space boolean);
insert into pick values
(3,'2147346540',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (New York, United States).',false),
(5,'2147317593',0.800,'matched',0.9,'Long/short equity stated, buys hedge funds (Abu Dhabi, United Arab Emirates).',false),
(6,'2147318911',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (West Conshohocken, United States).',false),
(7,'2147328608',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Philadelphia, United States).',false),
(8,'2147326330',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (Washington, United States).',false),
(10,'2147325169',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (Boston, United States).',false),
(11,'2147331487',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (London, United Kingdom).',false),
(13,'2147351416',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (diversified, special situations, secondaries) is not long/short, quant or technology: needs data (Singapore).',false),
(14,'2147330331',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (agriculture & farming) is not long/short, quant or technology: needs data (Montreal, Canada).',false),
(15,'2147329091',0.800,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Zug, Switzerland).',false),
(16,'9041',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Tokyo, Japan).',false),
(21,'2147349868',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (corporate bonds, government bonds, high-yield) is not long/short, quant or technology: needs data (Geneva, Switzerland).',false),
(22,'2147326442',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (multi-strategy) is not long/short, quant or technology: needs data (Chicago, United States).',false),
(27,'8510',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (Philadelphia, United States).',false),
(29,'2147318738',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (London, United Kingdom).',false),
(30,'2147352014',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (multi-strategy) is not long/short, quant or technology: needs data (Wollerau, Switzerland).',false),
(34,'2147324962',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Pittsburgh, United States).',false),
(37,'2147348776',1.000,'uncertain',0.6,'Space interest, but no long/short or quant stated: worth a look (Singapore).',true),
(41,'8643',0.800,'matched',0.95,'Long/short equity stated, buys hedge funds (Princeton, United States).',false),
(43,'2147327651',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Coral Gables, United States).',false),
(44,'2147345607',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (digital assets, equity) is not long/short, quant or technology: needs data (Singapore).',false),
(46,'2147351460',0.800,'matched',0.95,'Long/short equity stated, buys hedge funds (Columbus, United States).',false),
(47,'2147330706',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (direct lending, opportunistic, generalist) is not long/short, quant or technology: needs data (Singapore).',false),
(52,'1309235863',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Waltham, United States).',false),
(53,'2147330483',0.800,'matched',0.9,'Long/short equity stated, buys hedge funds (Paris, France).',false),
(54,'2147330252',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (New Haven, United States).',false),
(57,'2147330892',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (corporate bonds, emerging markets debt, government bonds) is not long/short, quant or technology: needs data (Dubai, United Arab Emirates).',false),
(58,'2147331133',1.000,'matched',0.9,'Long/short equity stated, buys hedge funds (Milan, Italy).',false),
(59,'986391509',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (New York, United States).',false),
(64,'2147351830',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (fixed income/credit) is not long/short, quant or technology: needs data (Durham, United States).',false),
(68,'3858',0.800,'needs_data',NULL,'Buys hedge funds, but its strategy (equity) is not long/short, quant or technology: needs data (Oslo, Norway).',false),
(70,'2147351351',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (New York, United States).',false),
(76,'2147318823',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (London, United Kingdom).',false),
(78,'1567027005',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (New Brunswick, United States).',false),
(80,'2147318961',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (relative value, fixed income/credit) is not long/short, quant or technology: needs data (Evanston, United States).',false),
(85,'2147326119',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (London, United Kingdom).',false),
(90,'2147347844',1.000,'needs_data',NULL,'Hedge-fund appetite not stated; no strategy or technology stated: needs data (Wong Chuk Hang).',false),
(91,'2147324861',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Los Angeles, United States).',false),
(93,'2147351094',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Ottawa, Canada).',false),
(96,'2147319010',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (distressed debt, short term investment fund, buyout) is not long/short, quant or technology: needs data (New York, United States).',false),
(98,'2147346472',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Boston, United States).',false),
(99,'2147318805',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Melville, United States).',false),
(102,'2147347534',0.800,'rejected',0,'Does not buy hedge funds; no long/short or quant.',false),
(104,'2147318742',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (London, United Kingdom).',false),
(108,'2147329641',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (buyout, growth capital, secondaries) is not long/short, quant or technology: needs data (Hong Kong).',false),
(111,'2147325341',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (corporate bonds, inflation-linked bonds, short term investment fund) is not long/short, quant or technology: needs data (Toronto, Canada).',false),
(114,'2147331243',0.800,'low',0.25,'Only global macro stated, no long/short, quant or technology signal: the wrong fit for a long-biased L/S equity fund (Santa Monica, United States).',false),
(116,'2147332021',1.000,'low',0.25,'Only cta stated, no long/short, quant or technology signal: the wrong fit for a long-biased L/S equity fund (London, United Kingdom).',false),
(119,'2147347333',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (buyout, growth capital, secondaries) is not long/short, quant or technology: needs data (Westport, United States).',false),
(123,'2147325125',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (government bonds, corporate bonds, municipal bonds) is not long/short, quant or technology: needs data (New York, United States).',false),
(127,'2147347005',0.800,'needs_data',NULL,'Buys hedge funds, but its strategy (growth capital, early stage, pre-seed) is not long/short, quant or technology: needs data (Dallas, United States).',false),
(129,'2147325262',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Pittsford, United States).',false),
(133,'2147328176',0.800,'needs_data',NULL,'Buys hedge funds, but its strategy (multi-strategy) is not long/short, quant or technology: needs data (New York, United States).',false),
(136,'2147326252',0.800,'low',0.25,'Only cta stated, no long/short, quant or technology signal: the wrong fit for a long-biased L/S equity fund (Miami, United States).',false),
(137,'2147318706',0.800,'matched',0.95,'Long/short equity stated, buys hedge funds (Stamford, United States).',false),
(139,'2147347085',1.000,'rejected',0,'Does not buy hedge funds; no long/short or quant.',false),
(141,'2147325321',0.800,'matched',0.95,'Long/short equity stated, buys hedge funds (Boston, United States).',false),
(142,'2147351809',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (multi-strategy, relative value, statistical arbitrage) is not long/short, quant or technology: needs data (Luxembourg).',false),
(143,'2276',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (equity, long bias equity) is not long/short, quant or technology: needs data (Washington, United States).',false),
(144,'2147351518',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (New York, United States).',false),
(155,'2147326883',1.000,'low',0.25,'Only cta stated, no long/short, quant or technology signal: the wrong fit for a long-biased L/S equity fund (New York, United States).',false),
(159,'2147318702',0.800,'matched',0.95,'Long/short equity stated, buys hedge funds (Chicago, United States).',false),
(163,'2147330961',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (New York, United States, open to emerging managers).',false),
(164,'2147331345',0.800,'matched',0.95,'Long/short equity stated, buys hedge funds (Basel, Switzerland).',false),
(165,'2972',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (event driven, macro, relative value) is not long/short, quant or technology: needs data (Norwalk, United States).',false),
(166,'2147346636',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Hong Kong).',false),
(170,'2147319006',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (equity) is not long/short, quant or technology: needs data (Summit, United States).',false),
(173,'2147325296',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (New York, United States).',false),
(174,'2147318777',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (Charlotte, United States).',false),
(177,'2147351461',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (growth capital) is not long/short, quant or technology: needs data (Hong Kong, China).',false),
(179,'2147328702',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Geneva, Switzerland).',false),
(184,'2147319247',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (buyout, short term investment fund) is not long/short, quant or technology: needs data (München, Germany).',false),
(189,'1700',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (Atlanta, United States).',false),
(190,'2147318709',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (fixed income/credit, event driven, convertible arbitrage) is not long/short, quant or technology: needs data (New York, United States).',false),
(191,'2147326559',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (New York, United States).',false),
(192,'2147352777',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Boca Raton, United States).',false),
(196,'2147328129',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (New Canaan, United States).',false),
(197,'2147325962',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (early stage, series a, series b) is not long/short, quant or technology: needs data (San Francisco, United States).',false),
(202,'2147324555',1.000,'low',0.25,'Only cta stated, no long/short, quant or technology signal: the wrong fit for a long-biased L/S equity fund (Boca Raton, United States).',false),
(204,'2147318729',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (New York, United States).',false),
(207,'1554',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Westlake Village, United States).',false),
(211,'2147353355',1.000,'rejected',0,'Does not buy hedge funds; no long/short or quant.',false),
(212,'2147327654',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (growth capital, diversified, direct lending) is not long/short, quant or technology: needs data (Singapore).',false),
(213,'2147319219',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (short term investment fund, direct lending, energy) is not long/short, quant or technology: needs data (New York, United States).',false),
(216,'2147319116',0.800,'low',0.25,'Only cta stated, no long/short, quant or technology signal: the wrong fit for a long-biased L/S equity fund (Englewood, United States).',false),
(217,'2147330749',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (New York, United States).',false),
(218,'2147319020',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (Stamford, United States).',false),
(222,'2147318894',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (New York, United States).',false),
(226,'2147328163',1.000,'needs_data',NULL,'Buys hedge funds, but no strategy or technology stated: needs data (Morristown, United States).',false),
(231,'2147325250',0.800,'needs_data',NULL,'Buys hedge funds, but its strategy (equity, long only, tactical asset allocation) is not long/short, quant or technology: needs data (Minneapolis, United States).',false),
(233,'2147326094',1.000,'needs_data',NULL,'Buys hedge funds, but its strategy (growth capital, corporate bonds, short term investment fund) is not long/short, quant or technology: needs data (Toronto, Canada).',false),
(234,'2147331135',1.000,'matched',0.95,'Long/short equity stated, buys hedge funds (London, United Kingdom).',false);

insert into wi_mandates (record_key, source_message_id, investor_name, organization_name, investor_type, investor_country, investor_city,
  asset_classes, strategies, ticket_min_usd, ticket_max_usd, aum_usd, aum_band, min_manager_aum_usd, open_to_emerging_managers,
  intention_summary, evidence, qualification, new_qualification, new_fit_score, fit_reason, view_investor_url, is_space, space_signal,
  source_kind, alert_type, wi_enriched_at, rescored_at)
select 'iconn-wi-' || k.wi_id, 'iconnections:run5:row' || k.row_no, n ->> 'name', n ->> 'name', n ->> 'type',
       case n ->> 'country' when 'UK' then 'GB' when 'FX' then 'FR' else n ->> 'country' end, n ->> 'city',
       coalesce(n -> 'asset_classes', '[]'), coalesce(n -> 'strategies', '[]'),
       (n ->> 'ticket_min_usd')::numeric, (n ->> 'ticket_max_usd')::numeric, (n ->> 'aum_usd')::numeric, n ->> 'aum_band',
       (n ->> 'min_manager_aum_usd')::numeric, (n ->> 'emerging')::boolean,
       'From the I-Connections contact list (' || r.name || '); With Intelligence profile matched by name.',
       jsonb_build_object('wi_summary', btrim(regexp_replace(regexp_replace(coalesce(p.payload -> 'raw' ->> 'summary', ''), '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')),
                          'wi_investor_id', k.wi_id, 'iconnections_firm', r.name, 'iconnections_run', 5, 'iconnections_row', k.row_no,
                          'match', case when k.conf = 1 then 'exact name' else 'recommended option, approved 4 Nov 2026' end),
       case when k.nq in ('matched', 'rejected') then k.nq else 'uncertain' end, k.nq, k.ns, k.reason, n ->> 'link', k.space,
       case when k.space then coalesce('With Intelligence industry: ' || (select x from jsonb_array_elements_text(coalesce(s.industries, '[]') || coalesce(s.sectors, '[]')) x where x ~* '\maerospace\M' limit 1), 'With Intelligence profile mentions space')
            else 'With Intelligence profile: no space' end,
       'import', 'iConnections match', now(), now()
  from pick k
  join iconn_wi_profiles p on p.wi_id = k.wi_id and p.status = 'ok'
  left join wi_space_reads s on s.wi_id = k.wi_id
  join iconnections_import_rows r on r.run_id = 5 and r.import_no = (select import_no from iconnections_import_runs where id = 5) and r.row_no = k.row_no,
  lateral (select p.payload -> 'norm' as n) nn
on conflict (record_key) do nothing;

update iconnections_import_rows t
   set bucket = 'matched', match_method = case when k.conf = 1 then 'exact' else 'fuzzy' end, confidence = k.conf,
       matched_id = m.id, matched_name = m.investor_name, matched_status = m.new_qualification,
       opp_ids = array[m.id], opp_rejected = case when m.new_qualification = 'rejected' then 1 else 0 end,
       matched_fit = coalesce(m.new_fit_score, 0), matched_fit_reason = m.fit_reason, matched_at = now()
  from pick k join wi_mandates m on m.record_key = 'iconn-wi-' || k.wi_id
 where t.run_id = 5 and t.import_no = (select import_no from iconnections_import_runs where id = 5) and t.row_no = k.row_no;

-- UNDO (no DELETE by design): set those I-Connections rows back to bucket 'none'
-- (match_method / matched_* to null) and mark wi_mandates rows with record_key
-- like 'iconn-wi-%' validation_status = 'pending' (excluded everywhere in the app).
