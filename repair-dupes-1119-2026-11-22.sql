-- repair-dupes-1119-2026-11-22.sql   DRY RUN, NOT APPLIED. Needs the user's approval.
-- The Daily Investor Intel email of 19 Nov (raw email 653) repeated 10 items of that day's mandates digest (raw email 651).
-- Each copy (653) is marked a duplicate of the original (651, the lower id), soft only: dupe_of_id, merged_into,
-- validation_status = 'merged' (CLAUDE.md rules 2-3). Matched by the new item key (same With Intelligence link, or the
-- same item text, same alert date). Never a manual verdict; only rows not already marked.
-- To check before approving: St James's Place 3448 (original) is Rejected, its copy 3456 Needs data;
-- MassPRIM 3457 (copy) has hedge-fund investing confirmed, 3432 (original) unconfirmed.
BEGIN;
CREATE TABLE wi_mandates_backup_20261122_dupes1119 AS SELECT * FROM wi_mandates WHERE id IN (3455,3460,3461,3462,3463,3464,3456,3457,3458,3459);
WITH d(id, orig) AS (VALUES (3455,3428),(3460,3435),(3461,3436),(3462,3437),(3463,3438),(3464,3439),(3456,3448),(3457,3432),(3458,3433),(3459,3434)),
upd AS (
  UPDATE wi_mandates m SET dupe_of_id = d.orig, merged_into = d.orig, validation_status = 'merged', updated_at = now()
    FROM d WHERE m.id = d.id AND m.dupe_of_id IS NULL AND m.validation_status IS NULL AND m.verdict_source IS DISTINCT FROM 'manual'
  RETURNING m.id, m.investor_name, d.orig)
INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
SELECT u.id, u.investor_name, f.field, NULL, f.val,
       'Copy of row ' || u.orig || ' (same item in the 19 Nov mandates digest and Investor Intel email); repair-dupes-1119-2026-11-22, approved by the user', NULL
  FROM upd u CROSS JOIN LATERAL (VALUES ('dupe_of_id', u.orig::text), ('merged_into', u.orig::text), ('validation_status', 'merged')) f(field, val);
-- Expected: 10 rows, 30 log lines.
COMMIT;
-- UNDO:
-- BEGIN;
-- INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
--   SELECT mandate_id, investor_name, field, new_value, old_value, 'Undo of repair-dupes-1119-2026-11-22', wi_investor_id
--     FROM wi_fill_log WHERE source LIKE '%repair-dupes-1119-2026-11-22%' AND source NOT LIKE 'Undo%';
-- UPDATE wi_mandates m SET dupe_of_id = b.dupe_of_id, merged_into = b.merged_into, validation_status = b.validation_status, updated_at = now()
--   FROM wi_mandates_backup_20261122_dupes1119 b WHERE m.id = b.id;
-- COMMIT;
