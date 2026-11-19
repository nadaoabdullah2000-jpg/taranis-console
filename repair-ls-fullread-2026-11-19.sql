-- repair-ls-fullread-2026-11-19.sql   Approved by the user on 19 Nov 2026 (final calls on the full-history long/short re-check).
-- APPLIED 19 Nov 2026: 82 rows marked and rescored (3 Matched -> Review, 78 Review -> Needs data, San Bernardino Review 0.70 -> 0.40),
-- LACERA emerging managers = true; backup wi_mandates_backup_20261119_ls (82 rows); 248 wi_fill_log lines (every value that changed).
-- Dry run: Taranis-ls-fullread-dry-run-2026-11-18.xlsx (full With Intelligence history read 18 Nov, every long/short term fully covered;
-- profile enrichment of 76 investors added nothing). 82 rows get evidence.newest_intention_criteria = {long_short:false} (the console and
-- WI 01 then no longer count the long-list tag) and the console's own rescore:
--   70 removals (not stated):            67 Review -> Needs data; AARP 1.00, Princeton 0.95, Yale New Haven 0.95 -> Review
--   10 long/short-in-history demotions:   Eagle's View, SCS, MEABF, CalSTRS, Michigan, Fairfax Police (2), Golden LEAF, Indiana -> Needs data;
--                                         San Bernardino -> Review 0.40 (keeps its Space signal)
--    2 demotions confirmed: QRT, Texas SWIFT -> Needs data
--   + LACERA (1621) open_to_emerging_managers = true ("developing new emerging manager programs", With Intelligence profile summary).
-- Not touched: Fulcrum, ERS Texas (kept), the 6 equity-hedge rows, NPS, NMPERA, Ironwood (flagged), Kairos, MassPRIM,
-- manual verdicts (Crewcial, Harbourfront, Dallas ERF), Andrew Carnegie (1358).
-- ONE transaction. Backup: wi_mandates_backup_20261119_ls. Every value logged in wi_fill_log.
begin;
create temp table pl(id bigint primary key, grp text, q text, s numeric, curq text, curs numeric) on commit drop;
insert into pl values (135,'h','needs_data',null,'uncertain',0.6),(173,'h','needs_data',null,'uncertain',0.6),(260,'h','needs_data',null,'uncertain',0.65),(361,'r','needs_data',null,'uncertain',0.6),(456,'x','needs_data',null,'uncertain',0.6),(477,'h','uncertain',0.4,'uncertain',0.7),(492,'r','needs_data',null,'uncertain',0.65),(882,'r','needs_data',null,'uncertain',0.6),(888,'r','needs_data',null,'uncertain',0.6),(902,'r','needs_data',null,'uncertain',0.6),(916,'r','needs_data',null,'uncertain',0.6),(1621,'r','needs_data',null,'uncertain',0.65),(1823,'h','needs_data',null,'uncertain',0.65),(1907,'r','needs_data',null,'uncertain',0.6),(1913,'r','needs_data',null,'uncertain',0.6),(1930,'r','needs_data',null,'uncertain',0.6),(1947,'r','needs_data',null,'uncertain',0.6),(2054,'h','needs_data',null,'uncertain',0.6),(2103,'h','needs_data',null,'uncertain',0.6),(2871,'r','uncertain',0.7,'matched',1),(2880,'r','needs_data',null,'uncertain',0.6),(2881,'r','needs_data',null,'uncertain',0.6),(2885,'r','uncertain',0.6,'matched',0.95),(2892,'r','uncertain',0.6,'matched',0.95),(2902,'r','needs_data',null,'uncertain',0.6),(2910,'r','needs_data',null,'uncertain',0.6),(2921,'r','needs_data',null,'uncertain',0.6),(2923,'h','needs_data',null,'uncertain',0.6),(2935,'r','needs_data',null,'uncertain',0.6),(2941,'h','needs_data',null,'uncertain',0.6),(2946,'r','needs_data',null,'uncertain',0.6),(2953,'r','needs_data',null,'uncertain',0.6),(2958,'x','needs_data',null,'uncertain',0.65),(3177,'r','needs_data',null,'uncertain',0.6),(3179,'r','needs_data',null,'uncertain',0.6),(3180,'r','needs_data',null,'uncertain',0.6),(3182,'r','needs_data',null,'uncertain',0.6),(3183,'r','needs_data',null,'uncertain',0.6),(3185,'r','needs_data',null,'uncertain',0.6),(3189,'r','needs_data',null,'uncertain',0.6),(3190,'r','needs_data',null,'uncertain',0.6),(3191,'r','needs_data',null,'uncertain',0.6),(3192,'r','needs_data',null,'uncertain',0.65),(3193,'r','needs_data',null,'uncertain',0.6),(3194,'r','needs_data',null,'uncertain',0.6),(3198,'r','needs_data',null,'uncertain',0.6),(3199,'r','needs_data',null,'uncertain',0.6),(3200,'r','needs_data',null,'uncertain',0.6),(3202,'r','needs_data',null,'uncertain',0.6),(3203,'r','needs_data',null,'uncertain',0.6),(3204,'r','needs_data',null,'uncertain',0.6),(3205,'r','needs_data',null,'uncertain',0.6),(3206,'r','needs_data',null,'uncertain',0.6),(3207,'r','needs_data',null,'uncertain',0.6),(3208,'r','needs_data',null,'uncertain',0.6),(3211,'r','needs_data',null,'uncertain',0.6),(3214,'r','needs_data',null,'uncertain',0.6),(3217,'r','needs_data',null,'uncertain',0.6),(3218,'r','needs_data',null,'uncertain',0.6),(3219,'r','needs_data',null,'uncertain',0.6),(3220,'r','needs_data',null,'uncertain',0.6),(3221,'r','needs_data',null,'uncertain',0.6),(3222,'r','needs_data',null,'uncertain',0.6),(3224,'r','needs_data',null,'uncertain',0.6),(3225,'r','needs_data',null,'uncertain',0.65),(3226,'r','needs_data',null,'uncertain',0.6),(3227,'r','needs_data',null,'uncertain',0.6),(3229,'r','needs_data',null,'uncertain',0.6),(3230,'h','needs_data',null,'uncertain',0.6),(3231,'r','needs_data',null,'uncertain',0.6),(3232,'r','needs_data',null,'uncertain',0.65),(3233,'r','needs_data',null,'uncertain',0.6),(3234,'r','needs_data',null,'uncertain',0.6),(3235,'r','needs_data',null,'uncertain',0.6),(3238,'r','needs_data',null,'uncertain',0.6),(3240,'r','needs_data',null,'uncertain',0.6),(3241,'r','needs_data',null,'uncertain',0.6),(3242,'r','needs_data',null,'uncertain',0.6),(3244,'r','needs_data',null,'uncertain',0.6),(3248,'r','needs_data',null,'uncertain',0.6),(3249,'r','needs_data',null,'uncertain',0.6),(3251,'r','needs_data',null,'uncertain',0.6);
create temp table gb(grp text primary key, basis text) on commit drop;
insert into gb values
 ('r','full-history read 18 Nov 2026: no long/short in any With Intelligence note; long/short came only from a tag in a long list (approved by the user 19 Nov 2026)'),
 ('h','full-history read 18 Nov 2026: long/short only in past allocations or ruled out by the investor (demoted by the user 19 Nov 2026)'),
 ('x','long/short evidence only past or market-neutral (demoted by the user 19 Nov 2026)');
create table wi_mandates_backup_20261119_ls as
  select m.id, m.qualification, m.new_qualification, m.new_fit_score, m.evidence, m.open_to_emerging_managers
    from wi_mandates m where m.id in (select id from pl) or m.id = 1621;
create temp table go on commit drop as
  select pl.*, jsonb_build_object('newest_intention_criteria', jsonb_build_object('long_short', false, 'at', '2026-11-19', 'basis', gb.basis)) sets, gb.basis
    from pl join gb using (grp) join wi_mandates m using (id)
   where coalesce(m.verdict_source,'') <> 'manual' and m.id <> 1358 and coalesce(m.validation_status,'') not in ('merged','pending')
     and m.new_qualification is not distinct from pl.curq and m.new_fit_score is not distinct from pl.curs
     and jsonb_typeof(m.evidence) = 'object' and not (m.evidence ? 'newest_intention_criteria');
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, f.field, f.old, f.new, 'repair-ls-fullread-2026-11-19: ' || go.basis, m.evidence->>'wi_investor_id'
  from wi_mandates m join go using (id)
 cross join lateral (values
   ('evidence.newest_intention_criteria', m.evidence->>'newest_intention_criteria', (go.sets->'newest_intention_criteria')::text),
   ('new_qualification', m.new_qualification, go.q),
   ('new_fit_score', m.new_fit_score::text, go.s::text),
   ('qualification', m.qualification, case when go.q in ('matched','rejected') then go.q else 'uncertain' end)) f(field, old, new)
 where f.old is distinct from f.new;
update wi_mandates m set
  evidence = m.evidence || go.sets,
  new_qualification = go.q, new_fit_score = go.s,
  qualification = case when go.q in ('matched','rejected') then go.q else 'uncertain' end
  from go where go.id = m.id;
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, investor_name, 'open_to_emerging_managers', open_to_emerging_managers::text, 'true',
       'repair-ls-fullread-2026-11-19: With Intelligence profile summary (read 18 Nov): "The pension is in the process of developing new emerging manager programs across its asset classes" (approved by the user 19 Nov 2026)', evidence->>'wi_investor_id'
  from wi_mandates where id = 1621 and open_to_emerging_managers is null;
update wi_mandates set open_to_emerging_managers = true where id = 1621 and open_to_emerging_managers is null;
commit;
-- UNDO:
-- begin;
-- insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
--   select mandate_id, investor_name, field, new_value, old_value, 'Undo of repair-ls-fullread-2026-11-19', wi_investor_id
--     from wi_fill_log where source like 'repair-ls-fullread-2026-11-19:%';
-- update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification, new_fit_score = b.new_fit_score,
--   evidence = b.evidence, open_to_emerging_managers = b.open_to_emerging_managers
--   from wi_mandates_backup_20261119_ls b where b.id = m.id;
-- commit;
