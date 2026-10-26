-- Schema 17: remove a run from the iConnections "Earlier matches" list.
--
-- A run is keyed on the file's SHA-256, so a re-saved or re-exported copy
-- of the same file is a second run. The console lists one row per file
-- name (the newest run) and can take a file off the list. Taking it off
-- stamps hidden_at on that name's runs; nothing is deleted. Only the
-- staging table iconnections_import_runs changes, through the update the
-- console already has on it (runs_edit, schema-15): Opportunities
-- (wi_mandates), aliases and contacts are never touched. Matching the
-- file again clears the stamp on its run. Display only; matching is
-- unchanged. Safe to run twice. Mirrored in schema.sql, section 8.
-- Needs schema-15.

-- ---------------------------------------------------------------------
-- 1. HIDDEN RUNS
-- ---------------------------------------------------------------------
alter table public.iconnections_import_runs
  add column if not exists hidden_at timestamptz;   -- set when taken off the Earlier matches list; null = listed

-- ---------------------------------------------------------------------
-- ROLLBACK
--   alter table public.iconnections_import_runs drop column if exists hidden_at;
-- ---------------------------------------------------------------------
