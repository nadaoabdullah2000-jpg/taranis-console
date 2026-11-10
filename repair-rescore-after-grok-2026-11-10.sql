-- 10 Nov 2026: rescore of the rows Grok filled since the last rescore (9 Nov 17:32 UTC):
-- mandate runs grok-20261110-083956-0d5c, -084418-8642, -085113-cc47, -085533-c305,
-- -085903-7e12, -085957-b876, -090620-f9ae, -090624-d782 (150 log entries, 88 rows).
-- Rule: app.js rescore() from main after PR #4 (fixed macro / long-short rule), run locally on
-- the stored rows. A change counts as caused by Grok when the rule's proposal differs once
-- Grok's values are reverted from wi_fill_log. ONE transaction. Nothing deleted.
-- Applied: 14 rows (below). Each row changes only if it still holds the verdict the dry run saw,
-- never a manual verdict.
-- NOT applied:
--   * 316 Kentucky CERS, 1253 Nebraska Endowment Pool, 2085 and 2155 KWAP -> rejected: the only
--     reason is that Grok's asset classes do not list hedge funds (waiting for a decision).
--   * 533 TRS Texas: manual verdict.
--   * 768 IPERS, 1358 Andrew Carnegie Foundation, 1375 Wyoming RS, 1380 TRS Texas: matched only
--     through one equity_long_short tag in a long strategy list (open question from 9 Nov).
--   * 18 differences not caused by Grok (older rule).
-- Backup: rescore_backup_20261110. Logged in wi_fill_log, field 'Verdict'.

begin;

create temp table plan_1110 (id int primary key, cur_q text, cur_s numeric, q text, s numeric) on commit drop;
insert into plan_1110 values
(87, 'uncertain', 0.6, 'uncertain', 0.65),
(244, 'needs_data', null, 'uncertain', 0.7),
(347, 'needs_data', null, 'matched', 0.75),
(417, 'uncertain', 0.65, 'uncertain', 0.7),
(429, 'uncertain', 0.65, 'uncertain', 0.7),
(430, 'matched', 0.8, 'matched', 1),
(477, 'needs_data', null, 'uncertain', 0.6),
(489, 'needs_data', null, 'uncertain', 0.65),
(713, 'needs_data', null, 'uncertain', 0.74),
(815, 'needs_data', null, 'uncertain', 0.6),
(1071, 'matched', 0.8, 'matched', 1),
(1240, 'matched', 0.8, 'matched', 1),
(1387, 'needs_data', null, 'uncertain', 0.7),
(2895, 'matched', 0.8, 'matched', 1);

create temp table go_1110 on commit drop as
  select p.* from plan_1110 p join wi_mandates m on m.id = p.id
   where coalesce(m.new_qualification, m.qualification) = p.cur_q
     and m.new_fit_score is not distinct from p.cur_s
     and coalesce(m.verdict_source, '') <> 'manual';

create table rescore_backup_20261110 as
  select id, qualification, new_qualification, new_fit_score from wi_mandates where id in (select id from go_1110);

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id, source)
select m.id, m.investor_name, 'Verdict', concat_ws(' ', g.cur_q, coalesce(g.cur_s::text, '-')),
       concat_ws(' ', g.q, coalesce(g.s::text, '-')), m.evidence ->> 'wi_investor_id',
       'Rescore 10 Nov 2026 after Grok fills (app rule rescore(), fixed rule from PR #4)'
  from wi_mandates m join go_1110 g on g.id = m.id;

update wi_mandates m set qualification = case when g.q in ('matched', 'uncertain', 'rejected') then g.q else m.qualification end,
       new_qualification = g.q, new_fit_score = g.s
  from go_1110 g where g.id = m.id;

commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--          new_fit_score = b.new_fit_score
--     from rescore_backup_20261110 b where b.id = m.id;
--   commit;
