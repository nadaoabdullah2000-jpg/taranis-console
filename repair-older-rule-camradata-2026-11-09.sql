-- 9 Nov 2026 (decided by research@taranis.net). ONE transaction. Nothing deleted.
-- A. Older-rule rescore differences, only the ones chosen (app.js rescore(), rerun locally on the
--    stored rows just before applying; each row is changed only if it still holds the verdict the
--    dry run saw, never a manual verdict):
--      358 Texas PSF                       needs data -> matched 0.80
--      542 Harbourfront Wealth             needs data -> matched 0.75
--      1806, 1823 CalSTRS                  needs data -> matched 0.80
--      2054, 2103 Fairfax County Police    needs data -> matched 0.80
--      2482, 2497 Montana BOI              needs data -> review 0.74 (hedge fund investing unconfirmed)
--      268 New Hampshire RS                needs data -> review, no score (the rule says rejected only
--                                          because hedge funds are not among its asset classes)
--    NOT applied: the "macro wording" downgrades to low, and every review -> needs data change.
-- B. CAMRADATA: 3057 (the same 9 Nov alert, forwarded by email) merged into 3052; 3052 renamed
--    "Unidentified Hong Kong multi-family office (via CAMRADATA)", kept in review.
-- Backup: older_rule_backup_20261109. Logged in wi_fill_log.

begin;

create table older_rule_backup_20261109 as
  select id, qualification, new_qualification, new_fit_score, investor_name, organization_name,
         validation_status, merged_into, evidence, intention_summary
    from wi_mandates where id in (358, 542, 1806, 1823, 2054, 2103, 2482, 2497, 268, 3052, 3057);

create temp table older_plan (id int primary key, q text, s numeric) on commit drop;
insert into older_plan values
  (358, 'matched', 0.80), (542, 'matched', 0.75), (1806, 'matched', 0.80), (1823, 'matched', 0.80),
  (2054, 'matched', 0.80), (2103, 'matched', 0.80), (2482, 'uncertain', 0.74), (2497, 'uncertain', 0.74),
  (268, 'uncertain', null);

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id, source)
select m.id, m.investor_name, 'Verdict',
       concat_ws(' ', coalesce(m.new_qualification, m.qualification), coalesce(m.new_fit_score::text, '-')),
       concat_ws(' ', p.q, coalesce(p.s::text, '-')), m.evidence ->> 'wi_investor_id',
       case when m.id = 268
            then 'Rescore 9 Nov 2026, older rule: review instead of rejected (only reason: hedge funds not among the With Intelligence asset classes; decided by research@taranis.net)'
            else 'Rescore 9 Nov 2026, older rule (app rule rescore()), chosen by research@taranis.net' end
  from wi_mandates m join older_plan p on p.id = m.id
 where coalesce(m.new_qualification, m.qualification) = 'needs_data' and m.new_fit_score is null
   and coalesce(m.verdict_source, '') <> 'manual';

update wi_mandates m set qualification = p.q, new_qualification = p.q, new_fit_score = p.s
  from older_plan p
 where p.id = m.id and coalesce(m.new_qualification, m.qualification) = 'needs_data'
   and m.new_fit_score is null and coalesce(m.verdict_source, '') <> 'manual';

-- B. CAMRADATA
update wi_mandates k set
  evidence = (case when jsonb_typeof(k.evidence) = 'object' then k.evidence else '{}'::jsonb end)
             || jsonb_build_object('merged_rows', coalesce(k.evidence -> 'merged_rows', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                  'id', m.id, 'summary', m.intention_summary, 'tag', m.investor_tag, 'intention_url', m.view_intention_url,
                  'article_url', m.view_article_url, 'alert_date', m.alert_date, 'verdict', coalesce(m.new_qualification, m.qualification),
                  'score', m.new_fit_score, 'approved_at', m.approved_at, 'approved_by', m.approved_by,
                  'source_message_id', m.source_message_id))),
  investor_name = 'Unidentified Hong Kong multi-family office (via CAMRADATA)',
  organization_name = 'Unidentified Hong Kong multi-family office (via CAMRADATA)'
  from wi_mandates m where k.id = 3052 and m.id = 3057;

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source) values
  (3052, 'Unidentified Hong Kong multi-family office (via CAMRADATA)', 'Investor name', 'CAMRADATA Assisted Searches',
   'Unidentified Hong Kong multi-family office (via CAMRADATA)',
   'Rename 9 Nov 2026: CAMRADATA runs the search for an unnamed Hong Kong multi-family office (decided by research@taranis.net)'),
  (3057, 'CAMRADATA Assisted Searches', 'Merged into row', '', '3052',
   'Merge 9 Nov 2026: same alert (Hong Kong MFO assisted search via CAMRADATA, forwarded by email)');

update wi_mandates set validation_status = 'merged', merged_into = 3052 where id = 3057;
update iconnections_import_rows set matched_id = 3052 where matched_id = 3057;

commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--          new_fit_score = b.new_fit_score, investor_name = b.investor_name, organization_name = b.organization_name,
--          validation_status = b.validation_status, merged_into = b.merged_into, evidence = b.evidence,
--          intention_summary = b.intention_summary
--     from older_rule_backup_20261109 b where b.id = m.id;
--   commit;
