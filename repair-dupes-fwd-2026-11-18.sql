-- repair-dupes-fwd-2026-11-18.sql  (DRY RUN ONLY: not applied; waiting for the user's approval of the list)
-- 57 wi_mandates rows created on 17 Nov 2026 15:50-15:54 UTC from forwarded copies ("Fwd: ...") of With
-- Intelligence emails. Each one repeats an earlier row: same investor name (case-insensitive) and the same
-- intention_summary. Its dupe_of_id is set to the lowest such earlier id. Nothing else on the row changes.
-- Only rows whose verdict is NOT manual and whose dupe_of_id is still empty are touched (CLAUDE.md rule 4).
-- Note: the console does not hide rows by dupe_of_id today, so this marks the copies but does not hide them.

BEGIN;

CREATE TABLE wi_mandates_backup_20261118_dupes AS
SELECT m.* FROM wi_mandates m
  JOIN wi_raw_emails e ON e.id = m.raw_email_id
 WHERE e.subject LIKE 'Fwd:%' AND e.received_at > '2026-11-17 15:00+00';

WITH fw AS (
  SELECT m.id, m.investor_name, m.intention_summary
    FROM wi_mandates m JOIN wi_raw_emails e ON e.id = m.raw_email_id
   WHERE e.subject LIKE 'Fwd:%' AND e.received_at > '2026-11-17 15:00+00'
     AND m.dupe_of_id IS NULL AND m.verdict_source IS DISTINCT FROM 'manual'),
d AS (
  SELECT f.id, f.investor_name,
         (SELECT min(o.id) FROM wi_mandates o
           WHERE o.id < f.id AND lower(o.investor_name) = lower(f.investor_name)
             AND coalesce(o.intention_summary, '') = coalesce(f.intention_summary, '')) AS orig
    FROM fw f),
upd AS (
  UPDATE wi_mandates m SET dupe_of_id = d.orig, updated_at = now()
    FROM d WHERE m.id = d.id AND d.orig IS NOT NULL
  RETURNING m.id, m.investor_name, d.orig)
INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
SELECT id, investor_name, 'dupe_of_id', NULL, orig::text,
       'Forwarded copy (17 Nov 15:50-15:54 UTC) of row ' || orig || '; approved by research@taranis.net <DATE>', NULL
  FROM upd;

-- Expect 57 rows updated and 57 log lines; ROLLBACK if not.
SELECT count(*) FROM wi_fill_log WHERE field = 'dupe_of_id' AND source LIKE 'Forwarded copy (17 Nov%';

COMMIT;

-- UNDO:
-- BEGIN;
-- UPDATE wi_mandates m SET dupe_of_id = b.dupe_of_id, updated_at = now()
--   FROM wi_mandates_backup_20261118_dupes b WHERE m.id = b.id;
-- INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
-- SELECT b.id, b.investor_name, 'dupe_of_id', m_old.new_value, NULL, 'Undo of repair-dupes-fwd-2026-11-18', NULL
--   FROM wi_mandates_backup_20261118_dupes b
--   JOIN wi_fill_log m_old ON m_old.mandate_id = b.id AND m_old.field = 'dupe_of_id' AND m_old.source LIKE 'Forwarded copy (17 Nov%';
-- COMMIT;
