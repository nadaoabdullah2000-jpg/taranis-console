-- Taranis score, 6 Nov 2026. ONE transaction. Nothing is deleted.
-- Rule (app.js taranisScore = WI 01 Build Mandate SQL):
--   L = long/short or quant, T = technology, S = space (explicit wording),
--   E = invests in emerging managers (unknown counts as no).
--   L+T+E 1.00 (only way to 100%) | L+T 0.90 | L+S+E 0.80 | L+E 0.80 | L+S 0.78 | L 0.75
--   T+E 0.65 | T 0.60 | S+E 0.55 | S 0.50 | hire 0.60 | low 0.20 | needs data: no score
--   GB/CH/US +0.05 (not if the investor refuses emerging managers), never past the cap:
--   1.00 for L+T+E, 0.95 for L+T, 0.80 for L without T, 0.70 without L, 0.65 hire, 0.25 low.
-- 1. Space: 98 rows were Space = yes only because With Intelligence lists
--    "Aerospace" among its (hidden) investment industries. Not counted any more.
-- 2. Scores: 73 rows whose verdict the rule decides get the new score
--    (rejected rows, verdicts a person set, and rows whose verdict the rule
--    would not give today are left alone; their verdict does not change).
-- 3. 1 row with a person's verdict sat at 100% without L, T and E: its
--    score is capped to the rule's value; the verdict stays.
-- Logged in wi_fill_log (source 'Score rule 6 Nov 2026'). Backup: score_backup_20261106.

begin;

create table score_backup_20261106 as
  select id, new_fit_score, is_space, space_signal, verdict_set_at from wi_mandates;

alter table wi_mandates disable trigger zz_hf_hard_rule;

-- 1. Space
create temp table sp as select id from wi_mandates where id in (1942, 1957, 2614, 1981, 1975, 2508, 943, 1723, 1744, 1784, 1995, 1583, 1998, 2884, 774, 1563, 1385, 1357, 2697, 197, 1353, 1439, 2255, 1626, 2360, 1001, 1984, 1926, 2242, 1573, 2477, 132, 2396, 1630, 1977, 1634, 2542, 2611, 1893, 2311, 2326, 2476, 2672, 1876, 1069, 770, 2474, 282, 1972, 771, 1807, 1824, 537, 765, 2475, 292, 1284, 2507, 2509, 1310, 315, 1363, 2291, 2282, 1374, 210, 431, 343, 323, 359, 1354, 1324, 417, 533, 38, 2239, 1328, 2492, 1621, 1580, 2215, 1902, 1905, 1911, 1763, 2288, 37, 2384, 213, 492, 281, 430, 1356, 1362, 1380, 776, 772, 448)
  and is_space = true and space_signal like 'With Intelligence industry%';
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select m.id, m.investor_name, 'Space', 'Yes (' || m.space_signal || ')', 'No',
       'Score rule 6 Nov 2026: Aerospace is only one of the investment industries With Intelligence lists, not a stated space interest'
  from wi_mandates m join sp on sp.id = m.id;
update wi_mandates m set is_space = false,
       space_signal = 'Not counted: With Intelligence lists Aerospace only among its investment industries (was: ' || m.space_signal || ')'
  from sp where sp.id = m.id;

-- 2. Scores the rule decides
create temp table sc (id bigint primary key, old_s numeric, new_s numeric);
insert into sc values
  (1879, 0.9, 0.8),
  (2614, 1.0, 0.9),
  (2508, 1.0, 0.8),
  (160, 0.65, 0.7),
  (534, 0.9, 0.75),
  (938, 0.9, 0.75),
  (1377, 0.65, 0.55),
  (2939, 0.95, 0.8),
  (2900, 0.95, 0.8),
  (2869, 0.95, 0.8),
  (2934, 0.95, 0.8),
  (2923, 0.95, 0.8),
  (2871, 0.95, 0.8),
  (2952, 0.95, 0.8),
  (2327, 0.2, 0.25),
  (2888, 0.95, 0.8),
  (2102, 0.9, 0.8),
  (2125, 0.2, 0.25),
  (2157, 0.2, 0.25),
  (2187, 0.2, 0.25),
  (1357, 0.65, 0.55),
  (2259, 0.2, 0.25),
  (2269, 0.2, 0.25),
  (1896, 0.9, 0.8),
  (1240, 0.95, 0.8),
  (2364, 0.9, 1.0),
  (2885, 0.95, 0.8),
  (2892, 0.95, 0.8),
  (2895, 0.95, 0.8),
  (2325, 0.9, 0.75),
  (252, 0.65, 0.7),
  (9, 0.95, 1.0),
  (158, 0.9, 0.75),
  (2242, 1.0, 0.8),
  (1071, 0.95, 0.8),
  (132, 1.0, 0.8),
  (2310, 0.2, 0.25),
  (935, 0.9, 0.75),
  (2542, 1.0, 0.75),
  (2611, 1.0, 0.75),
  (537, 1.0, 0.8),
  (292, 1.0, 0.8),
  (2507, 1.0, 0.8),
  (315, 1.0, 0.8),
  (2928, 0.95, 0.8),
  (2891, 0.9, 0.75),
  (2929, 0.95, 0.8),
  (2894, 0.9, 0.75),
  (531, 0.9, 0.8),
  (210, 1.0, 0.8),
  (343, 1.0, 0.8),
  (323, 1.0, 0.8),
  (359, 1.0, 0.8),
  (1324, 1.0, 0.8),
  (2455, 0.9, 0.8),
  (2463, 0.9, 0.8),
  (2454, 0.9, 0.8),
  (199, 0.95, 0.8),
  (2363, 0.9, 0.75),
  (529, 0.95, 0.8),
  (1070, 0.95, 0.8),
  (1621, 1.0, 0.8),
  (2329, 0.9, 0.75),
  (2215, 1.0, 0.8),
  (2288, 1.0, 0.8),
  (281, 1.0, 0.8),
  (430, 1.0, 0.8),
  (398, 0.95, 1.0),
  (412, 0.65, 0.7),
  (448, 1.0, 0.8),
  (1312, 0.65, 0.7),
  (189, 0.95, 0.8),
  (325, 0.95, 0.8);
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select m.id, m.investor_name, 'Score', sc.old_s::text, sc.new_s::text, 'Score rule 6 Nov 2026'
  from wi_mandates m join sc on sc.id = m.id where m.new_fit_score is not distinct from sc.old_s;
update wi_mandates m set new_fit_score = sc.new_s
  from sc where sc.id = m.id and m.new_fit_score is not distinct from sc.old_s;

-- 3. A person's verdict at 100% without all three: score capped, verdict kept
create temp table mc (id bigint primary key, old_s numeric, new_s numeric);
insert into mc values
  (127, 1.0, 0.9);
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select m.id, m.investor_name, 'Score', mc.old_s::text, mc.new_s::text, 'Score rule 6 Nov 2026: 100% needs long/short, technology and emerging managers; verdict kept'
  from wi_mandates m join mc on mc.id = m.id where m.new_fit_score is not distinct from mc.old_s;
update wi_mandates m set new_fit_score = mc.new_s, verdict_set_at = now()   -- lets the manual-verdict guard accept the score
  from mc where mc.id = m.id and m.new_fit_score is not distinct from mc.old_s;

alter table wi_mandates enable trigger zz_hf_hard_rule;

commit;

-- UNDO (one block):
--   begin;
--   alter table wi_mandates disable trigger zz_hf_hard_rule;
--   update wi_mandates m set new_fit_score = b.new_fit_score, is_space = b.is_space,
--          space_signal = b.space_signal, verdict_set_at = b.verdict_set_at
--     from score_backup_20261106 b
--    where b.id = m.id and m.id in (select mandate_id from wi_fill_log where source like 'Score rule 6 Nov 2026%');
--   alter table wi_mandates enable trigger zz_hf_hard_rule;
--   commit;
