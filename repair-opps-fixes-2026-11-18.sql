-- repair-opps-fixes-2026-11-18.sql   Approved by the user on 18 Nov 2026 ("Go ahead with all four fixes").
-- APPLIED 18 Nov 2026: 12 rows backed up, 21 wi_fill_log lines (3 scores, 6 fields on 3393, 3 duplicate fields, 10 links).
-- 1. Stale scores (rows ingested 17 Nov 15:52-15:54 by the WI 01 version before the 17 Nov score table):
--      3348 POBA (forwarded copy)  Review 0.74 -> 0.60  (long/short only)
--      3320 SBCERS                 Review 0.74 -> 0.60  (long/short only)
--      3393 DL Family Office       Review 0.74 -> Matched 0.89, manual verdict (the user: long/short equity + AI).
--         Manual, so the database's hedge-fund rule (zz_hf_hard_rule) and match rule leave it at 0.89, as the console shows.
-- 2. 3348 marked as a duplicate of 3269 (forwarded copy the 17 Nov duplicate pass missed: its summary differs).
-- 3. view_article_url cleared on 10 rows whose "View article" link was another digest item's article (the parser
--    took the email's only "View article" link). The links stay in source_links; old values in the backup and log.
-- Backup: wi_mandates_backup_20261118_opps (all 12 rows, before). One wi_fill_log line per value changed.

BEGIN;

CREATE TABLE wi_mandates_backup_20261118_opps AS
SELECT * FROM wi_mandates WHERE id IN (146, 2057, 3014, 3052, 3069, 3269, 3284, 3323, 3348, 3394, 3320, 3393);

-- 1. Scores
INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
SELECT id, investor_name, 'new_fit_score', new_fit_score::text, '0.6',
       'Rescored to the 17 Nov score table (long/short only); repair-opps-fixes-2026-11-18, approved by the user 18 Nov 2026', evidence->>'wi_investor_id'
  FROM wi_mandates WHERE id IN (3348, 3320) AND new_fit_score = 0.74 AND verdict_source IS DISTINCT FROM 'manual';
UPDATE wi_mandates SET new_fit_score = 0.6,
       fit_reason = 'Rescored 18 Nov 2026 to the 17 Nov score table: long/short only, 0.60 (was 0.74 from the earlier WI 01 version).'
 WHERE id IN (3348, 3320) AND new_fit_score = 0.74 AND verdict_source IS DISTINCT FROM 'manual';

INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
SELECT m.id, m.investor_name, f.field, f.old, f.new,
       'Manual verdict, decided by the user 18 Nov 2026 (long/short equity + AI; console score 0.89); repair-opps-fixes-2026-11-18', m.evidence->>'wi_investor_id'
  FROM wi_mandates m CROSS JOIN LATERAL (VALUES
    ('new_qualification', m.new_qualification, 'matched'), ('qualification', m.qualification, 'matched'),
    ('new_fit_score', m.new_fit_score::text, '0.89'), ('verdict_source', m.verdict_source, 'manual'),
    ('hf_held_verdict', m.hf_held_verdict, NULL), ('hf_held_score', m.hf_held_score::text, NULL)) f(field, old, new)
 WHERE m.id = 3393 AND m.verdict_source IS DISTINCT FROM 'manual';
UPDATE wi_mandates SET new_qualification = 'matched', qualification = 'matched', new_fit_score = 0.89,
       verdict_source = 'manual', verdict_set_by = 'research (18 Nov 2026)', verdict_set_at = now(),
       hf_held_verdict = NULL, hf_held_score = NULL,
       fit_reason = 'Matched (decided 18 Nov 2026): long/short equity with an AI interest; scored 0.89, the low-match score (technology from the alert text, no With Intelligence quote). Hedge fund investing not yet confirmed.'
 WHERE id = 3393 AND verdict_source IS DISTINCT FROM 'manual';

-- 2. 3348 is a duplicate of 3269
INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
SELECT m.id, m.investor_name, f.field, NULL, f.val,
       'Forwarded copy (17 Nov 15:54 UTC) of row 3269; repair-opps-fixes-2026-11-18, approved by the user 18 Nov 2026', NULL
  FROM wi_mandates m CROSS JOIN LATERAL (VALUES ('dupe_of_id', '3269'), ('merged_into', '3269'), ('validation_status', 'merged')) f(field, val)
 WHERE m.id = 3348 AND m.dupe_of_id IS NULL AND m.validation_status IS NULL;
UPDATE wi_mandates SET dupe_of_id = 3269, merged_into = 3269, validation_status = 'merged'
 WHERE id = 3348 AND dupe_of_id IS NULL AND validation_status IS NULL;

-- 3. Wrong article links
INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
SELECT id, investor_name, 'view_article_url', view_article_url, NULL,
       'Cleared: the link was another digest item''s article (parser took the email''s only View article link); repair-opps-fixes-2026-11-18, approved by the user 18 Nov 2026', evidence->>'wi_investor_id'
  FROM wi_mandates WHERE id IN (146, 2057, 3014, 3052, 3069, 3269, 3284, 3323, 3348, 3394) AND view_article_url IS NOT NULL;
UPDATE wi_mandates SET view_article_url = NULL
 WHERE id IN (146, 2057, 3014, 3052, 3069, 3269, 3284, 3323, 3348, 3394) AND view_article_url IS NOT NULL;

-- Expected: 2 + 6 + 3 + 10 = 21 log lines.
COMMIT;

-- UNDO (restores every changed field from the backup and logs it):
-- BEGIN;
-- INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
-- SELECT mandate_id, investor_name, field, new_value, old_value, 'Undo of repair-opps-fixes-2026-11-18', wi_investor_id
--   FROM wi_fill_log WHERE source LIKE '%repair-opps-fixes-2026-11-18%' AND source NOT LIKE 'Undo%';
-- UPDATE wi_mandates m SET new_qualification = b.new_qualification, qualification = b.qualification, new_fit_score = b.new_fit_score,
--        verdict_source = b.verdict_source, verdict_set_by = b.verdict_set_by, verdict_set_at = b.verdict_set_at,
--        hf_held_verdict = b.hf_held_verdict, hf_held_score = b.hf_held_score, fit_reason = b.fit_reason,
--        dupe_of_id = b.dupe_of_id, merged_into = b.merged_into, validation_status = b.validation_status,
--        view_article_url = b.view_article_url
--   FROM wi_mandates_backup_20261118_opps b WHERE b.id = m.id;
-- COMMIT;
-- (The undo resets 3393's verdict_source from 'manual' in the same statement that restores verdict_set_at, so the
--  keep-manual trigger lets it through.)
