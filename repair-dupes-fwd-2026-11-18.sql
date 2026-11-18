-- repair-dupes-fwd-2026-11-18.sql   Approved by research@taranis.net on 18 Nov 2026 (57 rows, and hide them as merged).
-- 57 wi_mandates rows were created on 17 Nov 2026 15:50-15:54 UTC from forwarded copies ("Fwd: ...") of With
-- Intelligence emails. Each one repeats an earlier row: the same investor name (case-insensitive) and the same
-- intention_summary. For each copy, with orig = the lowest such earlier id:
--   dupe_of_id = orig, validation_status = 'merged', merged_into = orig (every existing merged row also has merged_into).
-- Only rows whose verdict is not manual, and whose dupe_of_id and validation_status are still empty, are touched
-- (CLAUDE.md rule 4). Soft hide, no delete (rule 3). One wi_fill_log line per field changed (rule 2).

BEGIN;

CREATE TABLE wi_mandates_backup_20261118_dupes AS
SELECT m.* FROM wi_mandates m
  JOIN wi_raw_emails e ON e.id = m.raw_email_id
 WHERE e.subject LIKE 'Fwd:%' AND e.received_at > '2026-11-17 15:00+00';

WITH fw AS (
  SELECT m.id, m.investor_name, m.intention_summary
    FROM wi_mandates m JOIN wi_raw_emails e ON e.id = m.raw_email_id
   WHERE e.subject LIKE 'Fwd:%' AND e.received_at > '2026-11-17 15:00+00'
     AND m.dupe_of_id IS NULL AND m.validation_status IS NULL AND m.verdict_source IS DISTINCT FROM 'manual'),
d AS (
  SELECT f.id,
         (SELECT min(o.id) FROM wi_mandates o
           WHERE o.id < f.id AND lower(o.investor_name) = lower(f.investor_name)
             AND coalesce(o.intention_summary, '') = coalesce(f.intention_summary, '')) AS orig
    FROM fw f),
upd AS (
  UPDATE wi_mandates m SET dupe_of_id = d.orig, merged_into = d.orig, validation_status = 'merged', updated_at = now()
    FROM d WHERE m.id = d.id AND d.orig IS NOT NULL
  RETURNING m.id, m.investor_name, d.orig)
INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
SELECT u.id, u.investor_name, f.field, NULL, f.val,
       'Forwarded copy (17 Nov 15:50-15:54 UTC) of row ' || u.orig || '; repair-dupes-fwd-2026-11-18, approved by research@taranis.net 18 Nov 2026', NULL
  FROM upd u
 CROSS JOIN LATERAL (VALUES ('dupe_of_id', u.orig::text), ('merged_into', u.orig::text), ('validation_status', 'merged')) f(field, val);

-- Expected: 57 rows updated, 171 log lines.
COMMIT;

-- UNDO (restores the three fields from the backup and logs it):
-- BEGIN;
-- INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
-- SELECT m.id, m.investor_name, f.field, f.cur, NULL, 'Undo of repair-dupes-fwd-2026-11-18', NULL
--   FROM wi_mandates m JOIN wi_mandates_backup_20261118_dupes b ON b.id = m.id
--  CROSS JOIN LATERAL (VALUES ('dupe_of_id', m.dupe_of_id::text), ('merged_into', m.merged_into::text), ('validation_status', m.validation_status)) f(field, cur)
--  WHERE m.validation_status = 'merged' AND b.validation_status IS NULL;
-- UPDATE wi_mandates m SET dupe_of_id = b.dupe_of_id, merged_into = b.merged_into, validation_status = b.validation_status, updated_at = now()
--   FROM wi_mandates_backup_20261118_dupes b WHERE m.id = b.id AND b.validation_status IS NULL AND m.validation_status = 'merged';
-- COMMIT;
