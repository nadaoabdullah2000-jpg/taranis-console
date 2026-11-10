-- 10 Nov 2026: review decisions by research@taranis.net. ONE transaction. Nothing deleted.
-- Backups: wi_mandates_backup_20261110_review, grok_checked_backup_20261110_review,
--          iconn_wi_lookup_backup_20261110_review. Logged in wi_fill_log.
--
-- Mandates
--   3066 New Mexico (and 3061, the same alert): linked to the New Mexico State Investment
--        Council (With Intelligence 2977), renamed, verdict low 0.2 by hand (it is considering
--        cutting its absolute return allocation).
--   465 FNBO: kept at needs data.  2914 Arbion: existing link kept.  (Taken off the unsure list.)
--   149 BVI wealth manager: kept in review (0.74), now a person's decision.
--   2185 (a service provider's news) and 484 (Ohio, Sep 2025, alternative risk premia): rejected.
--   316 Kentucky CERS, 1253 Nebraska Endowment, 2085 + 2155 KWAP: review, no score (the rule would
--        reject them only because hedge funds are not among their asset classes).
--   768 Iowa PERS, 1358 Andrew Carnegie Foundation, 1375 Wyoming RS, 1380 TRS Texas: review 0.74
--        (matched only through one long/short tag in a long strategy list).
--   533 TRS Texas (manual verdict): untouched.
-- I-Connections
--   Altegris: not on With Intelligence. JP Morgan, Mercer: left unlinked (several entities).
--   Blackstone, M4invest: Grok's candidates rejected, not linked.
--   TIFF: Grok's candidate (TIFF Investment Management, 2147325028) linked as certain.
--   Carnegie Corporation of New York -> Andrew Carnegie Foundation (9564): kept.

begin;

-- backups
create table wi_mandates_backup_20261110_review as
  select id, investor_name, organization_name, qualification, new_qualification, new_fit_score, fit_reason,
         verdict_source, verdict_set_by, verdict_set_at, approved_at, approved_by, evidence, view_investor_url
    from wi_mandates where id in (3061, 3066, 149, 2185, 484, 316, 1253, 2085, 2155, 768, 1358, 1375, 1380);
create table grok_checked_backup_20261110_review as
  select * from grok_checked where id in (648, 649, 707, 726, 854, 883, 895);
create table iconn_wi_lookup_backup_20261110_review as
  select * from iconn_wi_lookup where 'grok' = any(tried) and confidence = 'Grok candidate'
     and firm in ('Blackstone', 'M4invest', 'The Investment Fund for Foundations (TIFF)');

-- New Mexico 3061 / 3066 -> NMSIC (2977), low by hand
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id, source)
select id, investor_name, f.field, f.old_v, f.new_v, '2977', 'Review 10 Nov 2026 (decided by research@taranis.net): New Mexico State Investment Council'
  from wi_mandates m cross join lateral (values
    ('investor_name', m.investor_name, 'New Mexico State Investment Council (NMSIC)'),
    ('evidence.wi_investor_id', m.evidence ->> 'wi_investor_id', '2977'),
    ('view_investor_url', m.view_investor_url, 'https://platform.withintelligence.com/explore/investors/2977'),
    ('Verdict', concat_ws(' ', coalesce(m.new_qualification, m.qualification), coalesce(m.new_fit_score::text, '-')), 'low 0.2')) f(field, old_v, new_v)
 where m.id in (3061, 3066);
update wi_mandates
   set investor_name = 'New Mexico State Investment Council (NMSIC)', organization_name = 'New Mexico State Investment Council (NMSIC)',
       evidence = (case when jsonb_typeof(evidence) = 'object' then evidence else '{}'::jsonb end) || '{"wi_investor_id": "2977"}'::jsonb,
       view_investor_url = 'https://platform.withintelligence.com/explore/investors/2977',
       new_qualification = 'low', new_fit_score = 0.2,
       fit_reason = 'Review: New Mexico State Investment Council is considering cutting its absolute return allocation - low priority.',
       verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now()
 where id in (3061, 3066);

-- 149 kept in review, as a person's decision
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Verdict', concat_ws(' ', coalesce(new_qualification, qualification), coalesce(new_fit_score::text, '-')),
       concat_ws(' ', coalesce(new_qualification, qualification), coalesce(new_fit_score::text, '-')) || ' (kept by hand)',
       'Review 10 Nov 2026 (decided by research@taranis.net): a real search by an unnamed wealth manager, kept in review'
  from wi_mandates where id = 149;
update wi_mandates set verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now(),
       fit_reason = 'Review: a real search by an unnamed British Virgin Islands wealth manager (multi-strategy) - kept in review.'
 where id = 149;

-- 2185, 484 rejected
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Verdict', concat_ws(' ', coalesce(new_qualification, qualification), coalesce(new_fit_score::text, '-')), 'rejected 0',
       'Review 10 Nov 2026 (decided by research@taranis.net): ' || case id when 2185 then 'a service provider''s news, not a mandate'
                                                                       else 'over a year old and alternative risk premia, not long/short' end
  from wi_mandates where id in (2185, 484);
update wi_mandates
   set qualification = 'rejected', new_qualification = 'rejected', new_fit_score = 0,
       fit_reason = case id when 2185 then 'Not an investor mandate: a service provider''s news, not an allocator.'
                            else 'Criteria mismatch: Sep 2025 alert about alternative risk premia managers, not long/short.' end,
       verdict_source = 'manual', verdict_set_by = 'research@taranis.net', verdict_set_at = now(), approved_at = null, approved_by = null
 where id in (2185, 484);

-- the 8 held rows -> review (rule verdicts, not manual)
create temp table held_1110 (id int primary key, cur_q text, q text, s numeric) on commit drop;
insert into held_1110 values
  (316, 'needs_data', 'uncertain', null), (1253, 'needs_data', 'uncertain', null),
  (2085, 'needs_data', 'uncertain', null), (2155, 'needs_data', 'uncertain', null),
  (768, 'low', 'uncertain', 0.74), (1358, 'low', 'uncertain', 0.74),
  (1375, 'needs_data', 'uncertain', 0.74), (1380, 'uncertain', 'uncertain', 0.74);
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id, source)
select m.id, m.investor_name, 'Verdict', concat_ws(' ', coalesce(m.new_qualification, m.qualification), coalesce(m.new_fit_score::text, '-')),
       concat_ws(' ', h.q, coalesce(h.s::text, '-')), m.evidence ->> 'wi_investor_id',
       'Review 10 Nov 2026 (decided by research@taranis.net): ' || case when h.s is null
         then 'review instead of rejected (only reason: hedge funds not among the With Intelligence asset classes)'
         else 'review instead of matched (long/short only from one tag in a long strategy list)' end
  from wi_mandates m join held_1110 h on h.id = m.id
 where coalesce(m.new_qualification, m.qualification) = h.cur_q and coalesce(m.verdict_source, '') <> 'manual';
update wi_mandates m set qualification = 'uncertain', new_qualification = h.q, new_fit_score = h.s
  from held_1110 h
 where h.id = m.id and coalesce(m.new_qualification, m.qualification) = h.cur_q and coalesce(m.verdict_source, '') <> 'manual';

-- unsure list: reviewed, with the outcome recorded as a new entry
update grok_checked set reviewed_at = now(), reviewed_by = 'research@taranis.net'
 where id in (648, 649, 707, 726, 854, 883, 895) and reviewed_at is null;
insert into grok_checked (scope, mandate_id, firm_key, result, note, wi_id, checked_at, checked_by)
values
  ('mandates', 3061, null, 'done', 'Review 10 Nov: linked to New Mexico State Investment Council (2977), low priority', '2977', now(), 'research@taranis.net'),
  ('mandates', 3066, null, 'done', 'Review 10 Nov: linked to New Mexico State Investment Council (2977), low priority', '2977', now(), 'research@taranis.net'),
  ('mandates', 465, null, 'done', 'Review 10 Nov: kept at needs data (With Intelligence page empty)', null, now(), 'research@taranis.net'),
  ('mandates', 2914, null, 'done', 'Review 10 Nov: existing link kept (With Intelligence page empty)', '2147332021', now(), 'research@taranis.net'),
  ('iconnections', null, 'altegris', 'no_profile', 'Review 10 Nov: not on With Intelligence (only a fund profile; Altegris is a manager)', null, now(), 'research@taranis.net'),
  ('iconnections', null, 'jp morgan', 'no_profile', 'Review 10 Nov: left unlinked (several JP Morgan entities)', null, now(), 'research@taranis.net'),
  ('iconnections', null, 'mercer', 'no_profile', 'Review 10 Nov: left unlinked (several Mercer entities)', null, now(), 'research@taranis.net'),
  ('iconnections', null, 'blackstone', 'no_profile', 'Review 10 Nov: candidate Blackstone Private Wealth Solutions rejected; Blackstone is a manager', null, now(), 'research@taranis.net'),
  ('iconnections', null, 'm4invest', 'no_profile', 'Review 10 Nov: candidate M4 Investing rejected (different firm)', null, now(), 'research@taranis.net');

-- I-Connections candidates
update iconn_wi_lookup set confidence = 'Rejected candidate'
 where 'grok' = any(tried) and confidence = 'Grok candidate' and firm in ('Blackstone', 'M4invest');
update iconn_wi_lookup set confidence = 'Exact'
 where 'grok' = any(tried) and confidence = 'Grok candidate' and firm = 'The Investment Fund for Foundations (TIFF)';
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id, source) values
  (null, 'Blackstone', 'iconnections.candidate', '2147331515', 'rejected', '2147331515', 'Review 10 Nov 2026 (decided by research@taranis.net)'),
  (null, 'M4invest', 'iconnections.candidate', '2147355136', 'rejected', '2147355136', 'Review 10 Nov 2026 (decided by research@taranis.net)'),
  (null, 'The Investment Fund for Foundations (TIFF)', 'iconnections.link', null, '2147325028', '2147325028', 'Review 10 Nov 2026 (decided by research@taranis.net): candidate confirmed');

commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set investor_name = b.investor_name, organization_name = b.organization_name,
--          qualification = b.qualification, new_qualification = b.new_qualification, new_fit_score = b.new_fit_score,
--          fit_reason = b.fit_reason, verdict_source = b.verdict_source, verdict_set_by = b.verdict_set_by,
--          verdict_set_at = now(), approved_at = b.approved_at, approved_by = b.approved_by,
--          evidence = b.evidence, view_investor_url = b.view_investor_url
--     from wi_mandates_backup_20261110_review b where b.id = m.id;
--   update grok_checked c set reviewed_at = b.reviewed_at, reviewed_by = b.reviewed_by
--     from grok_checked_backup_20261110_review b where b.id = c.id;
--   update grok_checked set checked_at = checked_at - interval '400 days'      -- takes the new entries out of the 30-day window
--    where checked_by = 'research@taranis.net' and note like 'Review 10 Nov:%';
--   update iconn_wi_lookup l set confidence = b.confidence from iconn_wi_lookup_backup_20261110_review b where b.id = l.id;
--   commit;
-- (verdict_set_at must change for the manual-verdict guard to accept the restore.)
